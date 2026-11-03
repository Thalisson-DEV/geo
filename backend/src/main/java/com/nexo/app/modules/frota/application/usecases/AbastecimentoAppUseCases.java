package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.dto.AbastecimentoAppResponse;
import com.nexo.app.modules.frota.application.dto.ArquivoFotoChecklist;
import com.nexo.app.modules.frota.application.dto.CatalogoAbastecimentoAppResponse;
import com.nexo.app.modules.frota.application.dto.RealizarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.dto.SolicitarAbastecimentoRequest;
import com.nexo.app.modules.frota.application.mappers.AbastecimentoMapper;
import com.nexo.app.modules.frota.application.events.AnaliseIaPedida;
import com.nexo.app.modules.frota.domain.Abastecimento;
import com.nexo.app.modules.frota.domain.AlvoAnaliseIa;
import com.nexo.app.modules.frota.domain.Combustivel;
import com.nexo.app.modules.frota.domain.EtapaAlertaAbastecimento;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.FinalidadeChecklist;
import com.nexo.app.modules.frota.domain.FotoAbastecimento;
import com.nexo.app.modules.frota.domain.ProdutoAbastecimento;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.TipoFotoAbastecimento;
import com.nexo.app.modules.frota.infrastructure.persistence.AbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ChecklistRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PostoAbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ProdutoAbastecimentoRepository;
import com.nexo.app.shared.domain.events.FrotaAbastecimentoSolicitadoEvent;
import com.nexo.app.shared.domain.exception.ArmazenamentoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Abastecimento pelo app (campo ou administrativo): catálogo, pedido, fotos, cancelamento
 * antes da liberação e o realizado. Reenviar o mesmo pedido ou a mesma foto não duplica.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AbastecimentoAppUseCases {

    static final String PERMISSAO_LIBERAR = "frota:abastecimento:liberar";
    private static final long TAMANHO_MAXIMO_FOTO = 10L * 1024 * 1024;
    private static final Map<String, String> TIPOS_FOTO = Map.of("image/jpeg", "jpg", "image/png", "png", "image/webp", "webp");
    private static final int DIAS_NO_APP = 15;

    private final AbastecimentoRepository repository;
    private final PostoAbastecimentoRepository postos;
    private final ProdutoAbastecimentoRepository produtos;
    private final FichaVeiculoRepository fichas;
    private final ChecklistRepository checklists;
    private final LiberacaoCnhUseCases liberacoes;
    private final CarteiraAprovacaoUseCases carteiras;
    private final OdometroUseCases odometro;
    private final HistoricoAbastecimento historico;
    private final ReferenciasFrota referencias;
    private final AbastecimentoMapper mapper;
    private final ObjectStorageService objectStorage;
    private final ApplicationEventPublisher eventos;
    private final PrecoPostoUseCases precos;

    @Transactional(readOnly = true)
    public CatalogoAbastecimentoAppResponse catalogo() {
        var ativos = postos.findAllByAtivoTrueOrderByNomeAsc();
        var bases = referencias.nomesBases(ativos.stream().map(p -> p.getIdBaseOperacional()).toList());
        var precosHoje = precos.vigentes(ativos.stream().map(p -> p.getId()).toList(),
                java.time.LocalDate.now(Abastecimento.FUSO));
        var listaProdutos = produtos.findAllByAtivoTrueOrderByCategoriaAscNomeAsc();
        var preferidos = fichas.findAll().stream()
                .filter(f -> f.isAtivo() && f.getCombustivel() != null)
                .flatMap(f -> preferido(f.getCombustivel(), listaProdutos)
                        .map(p -> new CatalogoAbastecimentoAppResponse.Preferido(f.getIdVeiculo(), p.getId())).stream())
                .toList();
        return new CatalogoAbastecimentoAppResponse(OffsetDateTime.now(),
                ativos.stream().map(p -> new CatalogoAbastecimentoAppResponse.Posto(p.getId(), p.getNome(), p.getIdBaseOperacional(),
                        p.getIdBaseOperacional() == null ? null : bases.get(p.getIdBaseOperacional()),
                        precosHoje.getOrDefault(p.getId(), Map.of()).entrySet().stream()
                                .map(e -> new CatalogoAbastecimentoAppResponse.Preco(e.getKey(), e.getValue())).toList())).toList(),
                listaProdutos.stream().map(p -> new CatalogoAbastecimentoAppResponse.Produto(p.getId(), p.getNome(), p.getCategoria(),
                        p.getUnidade())).toList(),
                preferidos);
    }

    /** Abastecimentos do usuário e da equipe dele nos últimos dias (o que o app acompanha). */
    @Transactional(readOnly = true)
    public List<AbastecimentoAppResponse> meus() {
        var usuario = usuarioLogado();
        var equipe = referencias.equipeDoUsuario(usuario);
        var lista = repository.doUsuarioOuEquipe(usuario, equipe, referencias.colaboradorDoUsuario(usuario),
                OffsetDateTime.now().minusDays(DIAS_NO_APP));
        return responder(lista, usuario, equipe);
    }

    @Transactional
    public AbastecimentoAppResponse solicitar(SolicitarAbastecimentoRequest request) {
        var usuario = usuarioLogado();
        var existente = repository.findByIdAparelho(request.idAparelho());
        if (existente.isPresent()) {
            return responder(existente.get(), usuario, referencias.equipeDoUsuario(usuario), null);
        }
        var ficha = ficha(request.idVeiculo());
        if (!referencias.colaboradorAtivo(request.idCondutor())) {
            throw new InvarianteVioladaException("Condutor não encontrado ou desligado.");
        }
        var dia = request.solicitadoEm().atZoneSameInstant(Abastecimento.FUSO).toLocalDate();
        var inicio = dia.atStartOfDay(Abastecimento.FUSO).toOffsetDateTime();
        if (!checklists.existsByIdVeiculoAndFinalidadeAndPreenchidoEmGreaterThanEqualAndPreenchidoEmLessThanAndAtivoTrue(
                ficha.getIdVeiculo(), FinalidadeChecklist.USO, inicio, inicio.plusDays(1))) {
            throw new InvarianteVioladaException("O " + ficha.getPlaca() + " ainda não tem checklist hoje. Faça o checklist antes de pedir abastecimento.");
        }
        liberacoes.exigirAptoOuLiberado(request.idCondutor(), ficha.getIdVeiculo(), dia);
        repository.findFirstByIdVeiculoAndSituacaoInAndAtivoTrue(ficha.getIdVeiculo(), SituacaoAbastecimento.EM_ANDAMENTO)
                .ifPresent(aberto -> {
                    throw new InvarianteVioladaException("O " + ficha.getPlaca() + " já tem um abastecimento "
                            + aberto.getSituacao().getRotulo().toLowerCase() + ". Conclua ou cancele esse antes de pedir outro.");
                });
        var posto = postos.findById(request.idPosto()).orElseThrow(() -> new RecursoNaoEncontradoException("Posto não encontrado."));
        var porId = produtos.findAllById(request.itens().stream().map(SolicitarAbastecimentoRequest.Item::idProduto).toList())
                .stream().filter(ProdutoAbastecimento::isAtivo).collect(Collectors.toMap(ProdutoAbastecimento::getId, Function.identity()));
        var itens = request.itens().stream()
                .map(i -> new Abastecimento.ItemPedido(porId.get(i.idProduto()))).toList();
        // Trava do campo: casa decimal a mais no painel não entra (gestores, 23/10/2026).
        odometro.trava(ficha.getIdVeiculo()).exigir(inteiro(request.medicao()));

        var medicaoAnterior = odometro.medicaoAtual(ficha.getIdVeiculo()).map(FrotaOdometroApi.Medicao::valor).orElse(null);
        var abastecimento = repository.saveAndFlush(Abastecimento.solicitar(new Abastecimento.Solicitacao(
                request.idAparelho(), ficha.getIdVeiculo(), ficha.getIdBaseOperacional(), request.idCondutor(), usuario,
                referencias.equipeDoUsuario(usuario), posto, request.medicao(), request.destino(), request.observacao(), itens,
                request.idFotoPainel(), request.solicitadoEm())));
        abastecimento.registrarAlertas(EtapaAlertaAbastecimento.SOLICITACAO, historico.solicitacao(abastecimento, ficha, medicaoAnterior));
        abastecimento = repository.save(abastecimento);
        avisarAprovadores(abastecimento, ficha);
        return responder(abastecimento, usuario, abastecimento.getIdEquipe(), null);
    }

    /** Recebe uma foto esperada. Reenviar a mesma foto não muda nada. */
    @Transactional
    public AbastecimentoAppResponse enviarFoto(UUID idAparelho, UUID idAparelhoFoto, MultipartFile arquivo) {
        var abastecimento = porAparelho(idAparelho);
        var foto = abastecimento.foto(idAparelhoFoto)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Esta foto não faz parte do abastecimento."));
        if (!foto.isRecebida()) {
            enviarArquivo(abastecimento, foto, arquivo);
            var ficha = ficha(abastecimento.getIdVeiculo());
            // A foto repetida só aparece quando o arquivo chega: recalcula os alertas da etapa.
            if (foto.getTipo() == TipoFotoAbastecimento.PAINEL_ANTES) {
                abastecimento.registrarAlertas(EtapaAlertaAbastecimento.SOLICITACAO,
                        historico.solicitacao(abastecimento, ficha, null));
            } else if (abastecimento.getSituacao() == SituacaoAbastecimento.REALIZADA) {
                abastecimento.registrarAlertas(EtapaAlertaAbastecimento.REALIZADO, historico.realizado(abastecimento, ficha, null));
            }
            repository.save(abastecimento);
            // Pedido com o painel ou realizado com o painel e o cupom: o Assistente analisa sozinho.
            if (abastecimento.fotosPendentes().isEmpty()) {
                eventos.publishEvent(new AnaliseIaPedida(AlvoAnaliseIa.ABASTECIMENTO, abastecimento.getId()));
            }
        }
        var usuario = usuarioLogado();
        return responder(abastecimento, usuario, referencias.equipeDoUsuario(usuario), null);
    }

    /** Foto do pedido para o detalhe do app: quem pediu, a equipe dele ou quem libera. */
    @Transactional(readOnly = true)
    public ArquivoFotoChecklist baixarFoto(UUID idAparelho, UUID idAparelhoFoto) {
        var usuario = usuarioLogado();
        var abastecimento = porAparelho(idAparelho);
        if (!daEquipe(abastecimento, usuario, referencias.equipeDoUsuario(usuario)) && !condutor(abastecimento, usuario)
                && !SecurityUtils.possuiAutoridade(PERMISSAO_LIBERAR)
                && !carteiras.placasDoAprovador(usuario).contains(abastecimento.getIdVeiculo())) {
            throw new RecursoNaoEncontradoException("Abastecimento não encontrado.");
        }
        var foto = abastecimento.foto(idAparelhoFoto)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Esta foto não faz parte do abastecimento."));
        if (!foto.isRecebida()) {
            throw new RecursoNaoEncontradoException("Esta foto ainda não chegou ao servidor.");
        }
        var objeto = objectStorage.baixar(foto.getArquivoChave());
        return new ArquivoFotoChecklist(foto.getArquivoNome(), foto.getArquivoContentType(), foto.getArquivoTamanhoBytes(), objeto.conteudo());
    }

    /** Cancelamento pelo app: antes da liberação, quem pediu ou a equipe dele; depois, só quem libera. */
    @Transactional
    public AbastecimentoAppResponse cancelar(UUID idAparelho, String motivo) {
        var usuario = usuarioLogado();
        var equipe = referencias.equipeDoUsuario(usuario);
        var abastecimento = porAparelho(idAparelho);
        if (abastecimento.getSituacao() == SituacaoAbastecimento.CANCELADA) {
            return responder(abastecimento, usuario, equipe, null);
        }
        boolean liberador = SecurityUtils.possuiAutoridade(PERMISSAO_LIBERAR);
        if (!liberador && !daEquipe(abastecimento, usuario, equipe)) {
            throw new InvarianteVioladaException("Só quem pediu ou a equipe dele pode cancelar este abastecimento.");
        }
        abastecimento.cancelar(usuario, motivo, liberador, OffsetDateTime.now());
        return responder(repository.save(abastecimento), usuario, equipe, null);
    }

    @Transactional
    public AbastecimentoAppResponse realizar(UUID idAparelho, RealizarAbastecimentoRequest request) {
        var usuario = usuarioLogado();
        var equipe = referencias.equipeDoUsuario(usuario);
        var abastecimento = porAparelho(idAparelho);
        if (abastecimento.getSituacao() == SituacaoAbastecimento.REALIZADA) {
            return responder(abastecimento, usuario, equipe, null);
        }
        if (!daEquipe(abastecimento, usuario, equipe) && !condutor(abastecimento, usuario)
                && !SecurityUtils.possuiAutoridade(PERMISSAO_LIBERAR)) {
            throw new InvarianteVioladaException("Só quem pediu, a equipe dele ou o condutor registra o abastecimento.");
        }
        var porId = produtos.findAllById(request.itens().stream().map(RealizarAbastecimentoRequest.Item::idProduto)
                .filter(java.util.Objects::nonNull).toList()).stream()
                .collect(Collectors.toMap(ProdutoAbastecimento::getId, Function.identity()));
        // O KM depois do posto não fica abaixo do pedido nem do último registrado, nem salta além da trava.
        odometro.trava(abastecimento.getIdVeiculo())
                .comReferenciaMinima(inteiro(abastecimento.getMedicaoSolicitacao()))
                .exigir(inteiro(request.medicao()));
        var dia = request.realizadoEm().atZoneSameInstant(Abastecimento.FUSO).toLocalDate();
        var semPreco = new java.util.ArrayList<com.nexo.app.modules.frota.domain.AnaliseAbastecimento.Alerta>();
        var realizados = request.itens().stream().map(i -> {
            var item = abastecimento.item(i.idItem());
            var produto = i.idProduto() == null ? item.getProdutoPedido() : produtoExistente(porId, i.idProduto());
            var preco = precos.vigente(abastecimento.getPosto().getId(), produto.getId(), dia).orElse(null);
            if (preco == null && i.quantidade() != null && i.quantidade().signum() > 0) {
                semPreco.add(com.nexo.app.modules.frota.domain.AnaliseAbastecimento.postoSemPreco(produto.getNome(),
                        abastecimento.getPosto().getNome()));
            }
            return new Abastecimento.ItemRealizado(i.idItem(), i.idProduto() == null ? null : produto, i.quantidade(), i.valorTotal(),
                    preco, i.tanqueCheio());
        }).toList();
        abastecimento.realizar(new Abastecimento.Realizado(request.medicao(), realizados, request.idFotoPainel(),
                request.idFotoCupom(), request.realizadoEm()));

        var ficha = ficha(abastecimento.getIdVeiculo());
        var medicaoAnterior = odometro.medicaoAtual(ficha.getIdVeiculo()).map(FrotaOdometroApi.Medicao::valor).orElse(null);
        var alertas = new java.util.ArrayList<>(historico.realizado(abastecimento, ficha, medicaoAnterior));
        alertas.addAll(semPreco);
        abastecimento.registrarAlertas(EtapaAlertaAbastecimento.REALIZADO, alertas);
        var leitura = odometro.registrarLeitura(ficha.getIdVeiculo(), abastecimento.getMedicaoRealizado().longValue(),
                request.realizadoEm(), FrotaOdometroApi.OrigemLeitura.ABASTECIMENTO, abastecimento.getId(), usuario);
        abastecimento.vincularLeitura(leitura.idLeitura());
        return responder(repository.save(abastecimento), usuario, equipe, leitura);
    }

    private void avisarAprovadores(Abastecimento a, FichaVeiculo ficha) {
        var aprovadores = new HashSet<>(carteiras.aprovadoresDaPlaca(a.getIdVeiculo()));
        var alertas = a.getAlertas().isEmpty() ? "" : " Atenção: " + a.getAlertas().stream()
                .map(al -> al.getTipo().getRotulo().toLowerCase(Locale.ROOT)).collect(Collectors.joining(", ")) + ".";
        eventos.publishEvent(new FrotaAbastecimentoSolicitadoEvent(a.getId(), ficha.getPlaca(),
                referencias.nomesPessoas(List.of(a.getIdUsuarioSolicitante())).get(a.getIdUsuarioSolicitante()), mapper.resumoItens(a), a.getPosto().getNome(),
                alertas, aprovadores, link(a)));
        if (aprovadores.isEmpty()) {
            log.warn("Abastecimento {} do {} sem aprovador: nenhuma carteira tem a placa.", a.getId(), ficha.getPlaca());
        }
    }

    /** Tela do abastecimento na web (o detalhe abre pela lista). */
    static String link(Abastecimento a) {
        return "/frota/abastecimentos?abastecimento=" + a.getId();
    }

    /** Combustível sugerido pela ficha; no flex, a gasolina. */
    private static java.util.Optional<ProdutoAbastecimento> preferido(Combustivel combustivel, List<ProdutoAbastecimento> lista) {
        return lista.stream().filter(p -> p.atende(combustivel))
                .min(Comparator.comparing(p -> p.getCombustivel() == Combustivel.GASOLINA ? 0 : 1));
    }

    private static ProdutoAbastecimento produtoExistente(Map<UUID, ProdutoAbastecimento> porId, UUID id) {
        var produto = porId.get(id);
        if (produto == null) {
            throw new RecursoNaoEncontradoException("Produto do abastecimento não encontrado.");
        }
        return produto;
    }

    /** O painel aceita casa decimal (horímetro 4.009,5 h); a trava compara a parte inteira. */
    private static long inteiro(java.math.BigDecimal valor) {
        return valor == null ? 0 : valor.setScale(0, java.math.RoundingMode.DOWN).longValueExact();
    }

    /** O usuário é o condutor do abastecimento (no avulso, quem vai ao posto). */
    private boolean condutor(Abastecimento a, UUID usuario) {
        var colaborador = referencias.colaboradorDoUsuario(usuario);
        return colaborador != null && colaborador.equals(a.getIdCondutor());
    }

    private static boolean daEquipe(Abastecimento a, UUID usuario, UUID equipe) {
        return a.getIdUsuarioSolicitante().equals(usuario) || (equipe != null && equipe.equals(a.getIdEquipe()));
    }

    private FichaVeiculo ficha(UUID idVeiculo) {
        var ficha = fichas.findByIdVeiculo(idVeiculo).orElseThrow(() -> new RecursoNaoEncontradoException("Veículo não encontrado na frota."));
        if (!ficha.isAtivo() || ficha.getSituacao() == SituacaoOperacional.BAIXADO) {
            throw new InvarianteVioladaException("O veículo " + ficha.getPlaca() + " não está disponível para uso.");
        }
        return ficha;
    }

    private Abastecimento porAparelho(UUID idAparelho) {
        return repository.findByIdAparelho(idAparelho)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Abastecimento não encontrado. Envie o pedido antes das fotos."));
    }

    private void enviarArquivo(Abastecimento abastecimento, FotoAbastecimento foto, MultipartFile arquivo) {
        if (arquivo == null || arquivo.isEmpty()) {
            throw new InvarianteVioladaException("Envie uma foto não vazia.");
        }
        if (arquivo.getSize() > TAMANHO_MAXIMO_FOTO) {
            throw new InvarianteVioladaException("A foto excede o limite de 10 MB.");
        }
        String contentType = arquivo.getContentType() == null ? null
                : arquivo.getContentType().toLowerCase(Locale.ROOT).split(";")[0].trim();
        if (contentType == null || !TIPOS_FOTO.containsKey(contentType)) {
            throw new InvarianteVioladaException("Envie a foto em JPG, PNG ou WEBP.");
        }
        String chave = "frota/abastecimentos/" + abastecimento.getId() + "/" + foto.getIdAparelho() + "." + TIPOS_FOTO.get(contentType);
        String hash;
        try (InputStream entrada = new DigestInputStream(arquivo.getInputStream(), MessageDigest.getInstance("SHA-256"))) {
            objectStorage.enviar(chave, entrada, arquivo.getSize(), contentType);
            hash = HexFormat.of().formatHex(((DigestInputStream) entrada).getMessageDigest().digest());
        } catch (IOException e) {
            throw new ArmazenamentoException("Falha ao ler a foto enviada.", e);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
        try {
            foto.anexar(chave, foto.getIdAparelho() + "." + TIPOS_FOTO.get(contentType), contentType, arquivo.getSize(), hash,
                    OffsetDateTime.now());
            repository.saveAndFlush(abastecimento);
        } catch (RuntimeException e) {
            try {
                objectStorage.remover(chave);
            } catch (RuntimeException falha) {
                log.warn("Não foi possível remover o objeto órfão {}: {}", chave, falha.getMessage());
            }
            throw e;
        }
    }

    private List<AbastecimentoAppResponse> responder(List<Abastecimento> lista, UUID usuario, UUID equipe) {
        var placas = referencias.veiculos(lista.stream().map(Abastecimento::getIdVeiculo).toList());
        var condutores = referencias.nomesColaboradores(lista.stream().map(Abastecimento::getIdCondutor).toList());
        var pessoas = pessoas(lista);
        return lista.stream().map(a -> mapper.toAppResponse(a,
                placas.containsKey(a.getIdVeiculo()) ? placas.get(a.getIdVeiculo()).placa() : null,
                condutores.get(a.getIdCondutor()), podeCancelar(a, usuario, equipe), true, null, pessoas)).toList();
    }

    private AbastecimentoAppResponse responder(Abastecimento a, UUID usuario, UUID equipe, FrotaOdometroApi.ResultadoLeitura leitura) {
        var veiculo = referencias.veiculos(List.of(a.getIdVeiculo())).get(a.getIdVeiculo());
        var condutor = referencias.nomesColaboradores(List.of(a.getIdCondutor())).get(a.getIdCondutor());
        return mapper.toAppResponse(a, veiculo == null ? null : veiculo.placa(), condutor, podeCancelar(a, usuario, equipe),
                leitura == null || leitura.valida(), leitura == null ? null : leitura.motivoInconsistencia(), pessoas(List.of(a)));
    }

    /** Nomes de quem aprovou e liberou, para a linha do tempo do app. */
    private java.util.Map<UUID, String> pessoas(List<Abastecimento> lista) {
        var ids = lista.stream().flatMap(a -> java.util.stream.Stream.of(a.getIdUsuarioAprovacao(), a.getIdUsuarioLiberacao()))
                .filter(java.util.Objects::nonNull).distinct().toList();
        return ids.isEmpty() ? java.util.Map.of() : referencias.nomesPessoas(ids);
    }

    private static boolean podeCancelar(Abastecimento a, UUID usuario, UUID equipe) {
        if (!a.getSituacao().emAndamento()) return false;
        if (a.getSituacao() == SituacaoAbastecimento.LIBERADA) return SecurityUtils.possuiAutoridade(PERMISSAO_LIBERAR);
        return daEquipe(a, usuario, equipe) || SecurityUtils.possuiAutoridade(PERMISSAO_LIBERAR);
    }

    private static UUID usuarioLogado() {
        var id = SecurityUtils.getUsuarioLogadoId();
        if (id == null) {
            throw new InvarianteVioladaException("Entre no app para pedir abastecimento.");
        }
        return id;
    }
}
