package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.AbastecimentoAvulsoRequest;
import com.nexo.app.modules.frota.application.dto.AbastecimentoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.AbastecimentoFilter;
import com.nexo.app.modules.frota.application.dto.AbastecimentoResumoResponse;
import com.nexo.app.modules.frota.application.dto.ArquivoFotoChecklist;
import com.nexo.app.modules.frota.application.dto.LiberarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.mappers.AbastecimentoMapper;
import com.nexo.app.modules.frota.domain.Abastecimento;
import com.nexo.app.modules.frota.domain.AlertaAbastecimento;
import com.nexo.app.modules.frota.domain.AvisoPostoAbastecimento;
import com.nexo.app.modules.frota.domain.EtapaAlertaAbastecimento;
import com.nexo.app.modules.frota.domain.FinalidadeChecklist;
import com.nexo.app.modules.frota.domain.ItemAbastecimento;
import com.nexo.app.modules.frota.domain.ProdutoAbastecimento;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.TipoAlertaAbastecimento;
import com.nexo.app.modules.frota.infrastructure.persistence.AbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.AbastecimentoSpecification;
import com.nexo.app.modules.frota.infrastructure.persistence.AvisoPostoAbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ProdutoAbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PostoAbastecimentoRepository;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.events.FrotaAbastecimentoAprovadoEvent;
import com.nexo.app.shared.domain.events.FrotaAbastecimentoAtualizadoEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Abastecimento na web: filas de aprovação (pela carteira de placas) e de liberação, detalhe,
 * decisões e o aviso ao posto por atalho do WhatsApp.
 */
@Service
@RequiredArgsConstructor
public class AbastecimentoUseCases {

    static final String FILA_APROVAR = "APROVAR";
    static final String FILA_LIBERAR = "LIBERAR";
    /** Todos os pedidos das placas da carteira de quem consulta, na situação do filtro. */
    static final String FILA_CARTEIRA = "CARTEIRA";

    private final AbastecimentoRepository repository;
    private final AvisoPostoAbastecimentoRepository avisos;
    private final PostoAbastecimentoRepository postos;
    private final FichaVeiculoRepository fichas;
    private final CarteiraAprovacaoUseCases carteiras;
    private final ReferenciasFrota referencias;
    private final AbastecimentoMapper mapper;
    private final ObjectStorageService objectStorage;
    private final ApplicationEventPublisher eventos;
    private final LiberacaoCnhUseCases liberacoes;
    private final OdometroUseCases odometro;
    private final ProdutoAbastecimentoRepository produtos;
    private final ChecklistRepository checklists;
    private final PrecoPostoUseCases precos;

    @Transactional(readOnly = true)
    public PageResponse<AbastecimentoResumoResponse> listar(AbastecimentoFilter filtro, Pageable pageable) {
        var f = filtro == null ? new AbastecimentoFilter(null, null, null, null, null, null, null, null, null, null) : filtro;
        var situacoes = f.situacoes();
        java.util.Collection<UUID> idsVeiculo = f.idVeiculo() == null ? null : List.of(f.idVeiculo());
        if (FILA_APROVAR.equalsIgnoreCase(f.fila())) {
            situacoes = List.of(SituacaoAbastecimento.AGUARDANDO_APROVACAO);
            idsVeiculo = interseccao(idsVeiculo, carteiras.placasDoAprovador(usuarioLogado()));
        } else if (FILA_LIBERAR.equalsIgnoreCase(f.fila())) {
            situacoes = List.of(SituacaoAbastecimento.APROVADA);
        } else if (FILA_CARTEIRA.equalsIgnoreCase(f.fila())) {
            idsVeiculo = interseccao(idsVeiculo, carteiras.placasDoAprovador(usuarioLogado()));
        }
        if (f.busca() != null && !f.busca().isBlank()) {
            idsVeiculo = interseccao(idsVeiculo, referencias.idsVeiculosPorTrecho(f.busca().trim()));
        }
        Page<Abastecimento> pagina = repository.findAll(AbastecimentoSpecification.of(situacoes, idsVeiculo, f.idsBase(), f.idPosto(),
                f.de(), f.ate(), f.comAlerta(), f.origem()), pageable);
        return PageResponse.fromPage(new org.springframework.data.domain.PageImpl<>(resumos(pagina.getContent()), pageable,
                pagina.getTotalElements()));
    }

    @Transactional(readOnly = true)
    public AbastecimentoDetalheResponse detalhar(UUID id) {
        return detalhe(buscar(id));
    }

    /** O aprovador define a quantidade de cada item (a equipe pede só o produto e o destino). */
    @Transactional
    public AbastecimentoDetalheResponse aprovar(UUID id, Map<UUID, BigDecimal> quantidades) {
        var a = buscar(id);
        exigirCarteira(a);
        a.aprovar(usuarioLogado(), quantidades, OffsetDateTime.now());
        registrarAlertasAprovacao(a);
        repository.save(a);
        avisarLiberadores(a);
        return detalhe(a);
    }

    /**
     * Abastecimento avulso, lançado na web por quem aprova a placa: nasce aprovado e vai direto
     * para a liberação. Sem foto do painel; o KM é opcional, mas, informado, passa pela trava.
     * A CNH continua bloqueando; a falta do checklist do dia vira alerta.
     */
    @Transactional
    public AbastecimentoDetalheResponse lancarAvulso(AbastecimentoAvulsoRequest request) {
        var usuario = usuarioLogado();
        carteiras.exigirAdministrativo(usuario);
        var ficha = fichas.findByIdVeiculo(request.idVeiculo())
                .orElseThrow(() -> new RecursoNaoEncontradoException("Veículo não encontrado na frota."));
        if (!ficha.isAtivo() || ficha.getSituacao() == SituacaoOperacional.BAIXADO) {
            throw new InvarianteVioladaException("O veículo " + ficha.getPlaca() + " não está disponível para uso.");
        }
        if (!carteiras.placasDoAprovador(usuario).contains(ficha.getIdVeiculo())) {
            throw new InvarianteVioladaException("A placa " + ficha.getPlaca() + " não está na sua carteira de aprovação.");
        }
        if (!referencias.colaboradorAtivo(request.idCondutor())) {
            throw new InvarianteVioladaException("Condutor não encontrado ou desligado.");
        }
        var agora = OffsetDateTime.now();
        var dia = agora.atZoneSameInstant(Abastecimento.FUSO).toLocalDate();
        liberacoes.exigirAptoOuLiberado(request.idCondutor(), ficha.getIdVeiculo(), dia);
        repository.findFirstByIdVeiculoAndSituacaoInAndAtivoTrue(ficha.getIdVeiculo(), SituacaoAbastecimento.EM_ANDAMENTO)
                .ifPresent(aberto -> {
                    throw new InvarianteVioladaException("O " + ficha.getPlaca() + " já tem um abastecimento "
                            + aberto.getSituacao().getRotulo().toLowerCase() + ". Conclua ou cancele esse antes de lançar outro.");
                });
        if (request.medicao() != null) {
            odometro.trava(ficha.getIdVeiculo()).exigir(request.medicao().setScale(0, java.math.RoundingMode.DOWN).longValueExact());
        }
        var posto = postos.findById(request.idPosto()).orElseThrow(() -> new RecursoNaoEncontradoException("Posto não encontrado."));
        var porId = produtos.findAllById(request.itens().stream().map(AbastecimentoAvulsoRequest.Item::idProduto).toList())
                .stream().filter(ProdutoAbastecimento::isAtivo).collect(Collectors.toMap(ProdutoAbastecimento::getId, p -> p));
        var a = Abastecimento.avulso(new Abastecimento.Avulso(ficha.getIdVeiculo(), ficha.getIdBaseOperacional(), request.idCondutor(),
                usuario, posto, request.medicao(), request.destino(), request.observacao(),
                request.itens().stream().map(i -> new Abastecimento.ItemAvulso(porId.get(i.idProduto()), i.quantidade())).toList(),
                agora));
        a = repository.saveAndFlush(a);
        var inicio = dia.atStartOfDay(Abastecimento.FUSO).toOffsetDateTime();
        var alertas = new java.util.ArrayList<com.nexo.app.modules.frota.domain.AnaliseAbastecimento.Alerta>();
        if (!checklists.existsByIdVeiculoAndFinalidadeAndPreenchidoEmGreaterThanEqualAndPreenchidoEmLessThanAndAtivoTrue(
                ficha.getIdVeiculo(), FinalidadeChecklist.USO, inicio, inicio.plusDays(1))) {
            alertas.add(new com.nexo.app.modules.frota.domain.AnaliseAbastecimento.Alerta(TipoAlertaAbastecimento.SEM_CHECKLIST,
                    "O " + ficha.getPlaca() + " não tinha checklist de uso hoje quando o avulso foi lançado."));
        }
        a.registrarAlertas(EtapaAlertaAbastecimento.SOLICITACAO, alertas);
        registrarAlertasAprovacao(a);
        a = repository.save(a);
        avisarLiberadores(a);
        return detalhe(a);
    }

    private void registrarAlertasAprovacao(Abastecimento a) {
        var ficha = fichas.findByIdVeiculo(a.getIdVeiculo()).orElse(null);
        var litros = a.getItens().stream().filter(i -> i.getProdutoPedido().isCombustivel())
                .map(ItemAbastecimento::getQuantidadeAprovada).filter(java.util.Objects::nonNull).findFirst().orElse(null);
        a.registrarAlertas(EtapaAlertaAbastecimento.APROVACAO, com.nexo.app.modules.frota.domain.AnaliseAbastecimento
                .analisarAprovacao(litros, ficha == null ? null : ficha.getCapacidadeTanqueLitros()));
    }

    private void avisarLiberadores(Abastecimento a) {
        eventos.publishEvent(new FrotaAbastecimentoAprovadoEvent(a.getId(), placa(a), mapper.resumoItens(a), a.getPosto().getNome(),
                referencias.nomesPessoas(List.of(a.getIdUsuarioAprovacao())).get(a.getIdUsuarioAprovacao()), AbastecimentoAppUseCases.link(a)));
    }

    @Transactional
    public AbastecimentoDetalheResponse reprovar(UUID id, String motivo) {
        var a = buscar(id);
        exigirCarteira(a);
        a.reprovar(usuarioLogado(), motivo, OffsetDateTime.now());
        repository.save(a);
        avisarSolicitante(a, "reprovado", "Motivo: " + a.getMotivoReprovacao() + " Se ainda precisar, peça de novo.");
        return detalhe(a);
    }

    @Transactional
    public AbastecimentoDetalheResponse liberar(UUID id, LiberarAbastecimentoRequest request) {
        var a = buscar(id);
        var outroPosto = request == null || request.idPosto() == null ? null
                : postos.findById(request.idPosto()).orElseThrow(() -> new RecursoNaoEncontradoException("Posto não encontrado."));
        a.liberar(usuarioLogado(), outroPosto, request == null ? null : request.quantidades(), OffsetDateTime.now());
        repository.save(a);
        var placa = placa(a);
        avisos.save(new AvisoPostoAbastecimento(a.getId(), AvisoPostoAbastecimento.Motivo.LIBERACAO, a.getPosto().getWhatsapp(),
                "Abastecimento liberado nº " + numero(a) + ": placa " + placa + ", condutor " + condutor(a) + ". "
                        + mapper.resumoItens(a) + ". Vale até hoje às 23h59. NEXO"));
        avisarSolicitante(a, "liberado", "Pode abastecer no " + a.getPosto().getNome() + " até as 23h59 de hoje.");
        return detalhe(a);
    }

    /** Cancelamento pela web (quem libera): depois da liberação, com motivo e aviso ao posto. */
    @Transactional
    public AbastecimentoDetalheResponse cancelar(UUID id, String motivo) {
        var a = buscar(id);
        boolean jaAvisado = a.liberadoParaOPosto();
        a.cancelar(usuarioLogado(), motivo, true, OffsetDateTime.now());
        repository.save(a);
        if (jaAvisado) {
            avisos.save(new AvisoPostoAbastecimento(a.getId(), AvisoPostoAbastecimento.Motivo.CANCELAMENTO, a.getPosto().getWhatsapp(),
                    "Abastecimento nº " + numero(a) + " da placa " + placa(a) + " foi CANCELADO. Não abastecer. NEXO"));
        }
        avisarSolicitante(a, "cancelado", a.getMotivoCancelamento() == null ? "Cancelado pelo administrativo." : "Motivo: " + a.getMotivoCancelamento());
        return detalhe(a);
    }

    /**
     * Vence o que foi aprovado ou liberado e não realizado até o fim do dia. O liberado ganha
     * o aviso de cancelamento ao posto, que fica pendente na fila até alguém abrir o atalho.
     *
     * @return quantos venceram
     */
    @Transactional
    public int vencer(OffsetDateTime agora) {
        var abertos = repository.findAllBySituacaoInAndVenceEmLessThanEqualAndAtivoTrue(
                List.of(SituacaoAbastecimento.APROVADA, SituacaoAbastecimento.LIBERADA), agora);
        int vencidos = 0;
        for (var a : abertos) {
            boolean liberado = a.liberadoParaOPosto();
            if (!a.vencer(agora)) continue;
            repository.save(a);
            vencidos++;
            if (liberado) {
                avisos.save(new AvisoPostoAbastecimento(a.getId(), AvisoPostoAbastecimento.Motivo.CANCELAMENTO, a.getPosto().getWhatsapp(),
                        "Abastecimento nº " + numero(a) + " da placa " + placa(a) + " venceu sem uso. Não abastecer. NEXO"));
            }
            avisarSolicitante(a, "vencido", "Não foi usado até o fim do dia. Se ainda precisar, peça de novo.");
        }
        return vencidos;
    }

    /** Quem libera abriu o atalho do WhatsApp do posto. */
    @Transactional
    public AbastecimentoDetalheResponse marcarAvisoAberto(UUID id, UUID idAviso) {
        var a = buscar(id);
        var aviso = avisos.findById(idAviso).filter(v -> v.getIdAbastecimento().equals(id))
                .orElseThrow(() -> new RecursoNaoEncontradoException("Aviso não encontrado."));
        aviso.marcarAberto(OffsetDateTime.now());
        avisos.save(aviso);
        return detalhe(a);
    }

    /** Foto do painel do último abastecimento realizado antes deste, no mesmo veículo. */
    public record PainelAnterior(UUID idAbastecimento, UUID idFoto, OffsetDateTime solicitadoEm) {
    }

    /** Painel do pedido anterior do veículo, para o Assistente comparar com o atual. */
    @Transactional(readOnly = true)
    public java.util.Optional<PainelAnterior> painelAnterior(UUID id) {
        var atual = buscar(id);
        return repository.realizadosAntes(atual.getIdVeiculo(), atual.getSolicitadoEm()).stream()
                .filter(a -> !a.getId().equals(id)).findFirst()
                .flatMap(anterior -> anterior.getFotos().stream()
                        .filter(f -> f.isRecebida() && f.getTipo() == com.nexo.app.modules.frota.domain.TipoFotoAbastecimento.PAINEL_ANTES)
                        .findFirst()
                        .map(f -> new PainelAnterior(anterior.getId(), f.getId(), anterior.getSolicitadoEm())));
    }

    @Transactional(readOnly = true)
    public ArquivoFotoChecklist baixarFoto(UUID id, UUID idFoto) {
        var foto = buscar(id).getFotos().stream().filter(f -> f.getId().equals(idFoto)).findFirst()
                .orElseThrow(() -> new RecursoNaoEncontradoException("Foto não encontrada."));
        if (!foto.isRecebida()) {
            throw new RecursoNaoEncontradoException("Esta foto ainda está no celular de quem pediu.");
        }
        var objeto = objectStorage.baixar(foto.getArquivoChave());
        return new ArquivoFotoChecklist(foto.getArquivoNome(), foto.getArquivoContentType(), foto.getArquivoTamanhoBytes(), objeto.conteudo());
    }

    private AbastecimentoDetalheResponse detalhe(Abastecimento a) {
        var usuario = usuarioLogado();
        var veiculo = referencias.veiculos(List.of(a.getIdVeiculo())).get(a.getIdVeiculo());
        var ficha = fichas.findByIdVeiculo(a.getIdVeiculo()).orElse(null);
        var usuarios = referencias.nomesPessoas(java.util.stream.Stream.of(a.getIdUsuarioSolicitante(), a.getIdUsuarioAprovacao(),
                a.getIdUsuarioLiberacao(), a.getIdUsuarioCancelamento()).filter(java.util.Objects::nonNull).toList());
        boolean liberador = SecurityUtils.possuiAutoridade(AbastecimentoAppUseCases.PERMISSAO_LIBERAR);
        return new AbastecimentoDetalheResponse(
                a.getId(), a.getIdVeiculo(), veiculo == null ? null : veiculo.placa(), veiculo == null ? null : veiculo.modelo(),
                a.getSituacao(), a.getSituacao().getRotulo(), a.getIdBaseOperacional(), base(a),
                usuarios.get(a.getIdUsuarioSolicitante()), condutor(a), a.getPosto().getId(), a.getPosto().getNome(), a.getPosto().getWhatsapp(),
                ficha == null ? "KM" : ficha.getUnidadeMedicao().name(), a.getMedicaoSolicitacao(), a.getMedicaoRealizado(),
                ficha == null ? null : ficha.getCapacidadeTanqueLitros(), a.getObservacao(),
                a.getSolicitadoEm(), nome(usuarios, a.getIdUsuarioAprovacao()), a.getAprovadoEm(), a.getMotivoReprovacao(),
                nome(usuarios, a.getIdUsuarioLiberacao()), a.getLiberadoEm(), a.getVenceEm(),
                nome(usuarios, a.getIdUsuarioCancelamento()), a.getCanceladoEm(), a.getMotivoCancelamento(),
                a.getRealizadoEm(), a.getSituacao() == SituacaoAbastecimento.REALIZADA ? a.valorTotal() : null,
                a.getItens().stream().map(mapper::toItem).toList(),
                a.getFotos().stream().map(f -> new AbastecimentoDetalheResponse.Foto(f.getId(), f.getTipo(), f.getTipo().getRotulo(), f.isRecebida()))
                        .sorted(Comparator.comparing(AbastecimentoDetalheResponse.Foto::tipo)).toList(),
                a.getAlertas().stream().map(al -> new AbastecimentoDetalheResponse.Alerta(al.getTipo(), al.getTipo().getRotulo(), al.getEtapa(),
                        al.getMensagem())).toList(),
                avisos.findAllByIdAbastecimentoOrderByDataCriacaoAsc(a.getId()).stream().map(v -> new AbastecimentoDetalheResponse.Aviso(
                        v.getId(), v.getMotivo().name(), v.getSituacao().name(), v.getMensagem(), v.linkWhatsapp(),
                        v.getSituacao() == AvisoPostoAbastecimento.Situacao.ENVIADO ? v.getUsuarioUltimaAlteracao() : null,
                        v.getEnviadoEm(), v.getDataCriacao())).toList(),
                a.getSituacao() == SituacaoAbastecimento.AGUARDANDO_APROVACAO && carteiras.placasDoAprovador(usuario).contains(a.getIdVeiculo()),
                liberador && a.getSituacao() == SituacaoAbastecimento.APROVADA,
                liberador && a.getSituacao().emAndamento(),
                a.getDestino(),
                a.getOrigem(),
                a.getOrigem().getRotulo(),
                precos.doAbastecimento(a.getId()));
    }

    private List<AbastecimentoResumoResponse> resumos(List<Abastecimento> lista) {
        var ids = lista.stream().map(Abastecimento::getIdVeiculo).toList();
        var veiculos = referencias.veiculos(ids);
        var condutores = referencias.nomesColaboradores(lista.stream().map(Abastecimento::getIdCondutor).toList());
        var logins = referencias.nomesPessoas(lista.stream().map(Abastecimento::getIdUsuarioSolicitante).toList());
        var bases = referencias.nomesBases(lista.stream().map(Abastecimento::getIdBaseOperacional).filter(java.util.Objects::nonNull).toList());
        Map<UUID, String> situacaoAviso = avisos.findAllByIdAbastecimentoIn(lista.stream().map(Abastecimento::getId).toList()).stream()
                .filter(v -> v.getMotivo() == AvisoPostoAbastecimento.Motivo.LIBERACAO)
                .collect(Collectors.toMap(AvisoPostoAbastecimento::getIdAbastecimento, v -> v.getSituacao().name(), (x, y) -> x));
        return lista.stream().map(a -> new AbastecimentoResumoResponse(a.getId(), a.getIdVeiculo(),
                veiculos.containsKey(a.getIdVeiculo()) ? veiculos.get(a.getIdVeiculo()).placa() : null,
                a.getSituacao(), a.getSituacao().getRotulo(), a.getSolicitadoEm(), logins.get(a.getIdUsuarioSolicitante()),
                condutores.get(a.getIdCondutor()), a.getIdBaseOperacional(), nome(bases, a.getIdBaseOperacional()), a.getPosto().getNome(),
                mapper.resumoItens(a), a.getSituacao() == SituacaoAbastecimento.REALIZADA ? a.valorTotal() : null,
                a.getAlertas().stream().map(AlertaAbastecimento::getTipo).distinct().toList(),
                situacaoAviso.get(a.getId()), a.getVenceEm(), a.getDestino(), a.getOrigem(), a.getOrigem().getRotulo())).toList();
    }

    private void avisarSolicitante(Abastecimento a, String situacao, String detalhe) {
        eventos.publishEvent(new FrotaAbastecimentoAtualizadoEvent(a.getId(), placa(a), situacao, detalhe, a.getIdUsuarioSolicitante(),
                AbastecimentoAppUseCases.link(a)));
    }

    /** Recusa quem não tem a placa do abastecimento na carteira de aprovação. */
    @Transactional(readOnly = true)
    public void exigirNaCarteira(UUID id) {
        exigirCarteira(buscar(id));
    }

    private void exigirCarteira(Abastecimento a) {
        carteiras.exigirAdministrativo(usuarioLogado());
        if (!carteiras.placasDoAprovador(usuarioLogado()).contains(a.getIdVeiculo())) {
            throw new InvarianteVioladaException("A placa " + placa(a) + " não está na sua carteira de aprovação.");
        }
    }

    private Abastecimento buscar(UUID id) {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Abastecimento não encontrado."));
    }

    private String placa(Abastecimento a) {
        var v = referencias.veiculos(List.of(a.getIdVeiculo())).get(a.getIdVeiculo());
        return v == null ? "" : v.placa();
    }

    private String condutor(Abastecimento a) {
        return referencias.nomesColaboradores(List.of(a.getIdCondutor())).getOrDefault(a.getIdCondutor(), "");
    }

    private String base(Abastecimento a) {
        return a.getIdBaseOperacional() == null ? null : referencias.nomesBases(List.of(a.getIdBaseOperacional())).get(a.getIdBaseOperacional());
    }

    /** Número curto que o posto confere com o motorista. */
    static String numero(Abastecimento a) {
        return a.getId().toString().substring(0, 8).toUpperCase(java.util.Locale.ROOT);
    }

    private static String nome(Map<UUID, String> nomes, UUID id) {
        return id == null ? null : nomes.get(id);
    }

    private static java.util.Collection<UUID> interseccao(java.util.Collection<UUID> atual, java.util.Collection<UUID> outros) {
        if (atual == null) return outros;
        return atual.stream().filter(outros::contains).toList();
    }

    private static UUID usuarioLogado() {
        var id = SecurityUtils.getUsuarioLogadoId();
        if (id == null) {
            throw new InvarianteVioladaException("Sessão sem usuário.");
        }
        return id;
    }
}
