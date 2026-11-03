package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.financeiro.ResumoSolicitacaoFinanceira;
import com.nexo.app.modules.frota.FrotaCondutorApi;
import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.events.AnaliseIaPedida;
import com.nexo.app.modules.frota.application.dto.AbrirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.AgendarOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.ConcluirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.EditarOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.FornecedorFrotaResponse;
import com.nexo.app.modules.frota.application.dto.IniciarOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.OrdemServicoFilter;
import com.nexo.app.modules.frota.application.dto.OrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.PainelOrdensServicoResponse;
import com.nexo.app.modules.frota.application.dto.ParadaVeiculoRequest;
import com.nexo.app.modules.frota.application.dto.PreenchimentoFinanceiroResponse;
import com.nexo.app.modules.frota.application.dto.PrevisaoOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.PreviaRepeticaoResponse;
import com.nexo.app.modules.frota.domain.AlvoAnaliseIa;
import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.EventoOrdemServico;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.ItemOrdemServico;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.OrigemPeca;
import com.nexo.app.modules.frota.domain.SituacaoAprovacaoOrcamento;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.SolicitacaoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoEventoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoOficina;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;
import com.nexo.app.modules.frota.infrastructure.persistence.EventoOrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoSpecification;
import com.nexo.app.modules.frota.infrastructure.persistence.SolicitacaoOrdemServicoRepository;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.events.FrotaManutencaoRepetidaEvent;
import com.nexo.app.shared.domain.events.FrotaOrdemServicoAbertaEvent;
import com.nexo.app.shared.domain.events.FrotaOrdemServicoAgendadaEvent;
import com.nexo.app.shared.domain.events.FrotaPrazoOsEstouradoEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Ciclo de vida da OS: abertura, edição, agenda, execução, encerramento, cancelamento,
 * veículo parado, painel e o que a OS entrega ao odômetro, ao financeiro e aos avisos.
 */
@Service
@RequiredArgsConstructor
public class OrdemServicoUseCases {

    static final String ORIGEM_FINANCEIRO = "FROTA_OS";
    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter DATA_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private final OrdemServicoRepository repository;
    private final FichaVeiculoRepository fichaRepository;
    private final EventoOrdemServicoRepository historicoRepository;
    private final SolicitacaoOrdemServicoRepository solicitacaoRepository;
    private final ItemManutencaoUseCases itens;
    private final RepeticoesManutencao repeticoes;
    private final RealizacoesPreventivas preventivas;
    private final MontadorOrdemServico montador;
    private final ReferenciasFrota referencias;
    private final FrotaCondutorApi condutores;
    private final FrotaOdometroApi odometro;
    private final FinanceiroApi financeiro;
    private final ApplicationEventPublisher eventPublisher;

    // ── Consultas ──────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<OrdemServicoResponse> listar(OrdemServicoFilter filtro, Pageable pageable) {
        Pageable ordenado = pageable.getSort().isSorted() ? pageable
                : PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(),
                        Sort.by(Sort.Order.desc("abertaEm"), Sort.Order.desc("numero")));
        var especificacao = OrdemServicoSpecification.of(filtro, OffsetDateTime.now());
        Page<OrdemServico> pagina;
        if (ordenado.getSort().getOrderFor(OrdemServicoSpecification.CRITICIDADE) != null) {
            // A gravidade é uma expressão: a ordenação inteira vai na especificação, sem o Sort da página.
            pagina = repository.findAll(OrdemServicoSpecification.ordenada(especificacao, ordenado.getSort()),
                    PageRequest.of(ordenado.getPageNumber(), ordenado.getPageSize()));
        } else {
            pagina = repository.findAll(especificacao, ordenado);
        }
        return PageResponse.fromPage(new PageImpl<>(montador.montar(pagina.getContent()), ordenado,
                pagina.getTotalElements()));
    }

    @Transactional(readOnly = true)
    public OrdemServicoDetalheResponse detalhar(UUID id) {
        return montador.detalhar(buscarEntidade(id), List.of());
    }

    /**
     * Contagens do painel. As abertas são poucas (centenas), então são lidas e contadas em
     * memória; a aprovação vem do financeiro em uma consulta.
     */
    @Transactional(readOnly = true)
    public PainelOrdensServicoResponse painel(List<UUID> idsBase) {
        OffsetDateTime agora = OffsetDateTime.now();
        var filtroAbertas = new OrdemServicoFilter(null, idsBase, List.copyOf(SituacaoOrdemServico.ABERTAS),
                null, null, null, null, null, null, null, null, null, null, null);
        List<OrdemServico> abertas = repository.findAll(OrdemServicoSpecification.of(filtroAbertas, agora));

        Map<String, Long> porCriticidade = new LinkedHashMap<>();
        Arrays.stream(Criticidade.values()).forEach(c -> porCriticidade.put(c.name(), 0L));
        long pendentes = 0;
        long agendadas = 0;
        long agendadasVencidas = 0;
        long emAndamento = 0;
        long atrasadas = 0;
        for (OrdemServico os : abertas) {
            switch (os.getSituacao()) {
                case PENDENTE -> {
                    pendentes++;
                    porCriticidade.merge(os.getCriticidade().name(), 1L, Long::sum);
                }
                case AGENDADA -> {
                    agendadas++;
                    if (os.getAgendadaPara() != null && os.getAgendadaPara().isBefore(agora)) agendadasVencidas++;
                }
                case EM_ANDAMENTO -> {
                    emAndamento++;
                    if (os.isAtrasada(agora)) atrasadas++;
                }
                default -> {
                }
            }
        }
        long parados = abertas.stream().filter(OrdemServico::isParadaEmCurso)
                .map(OrdemServico::getIdVeiculo).distinct().count();

        var filtroConcluidas = new OrdemServicoFilter(null, idsBase, List.of(SituacaoOrdemServico.CONCLUIDA),
                null, null, null, null, null, null, null, null, null, null, null);
        long concluidas = repository.count(OrdemServicoSpecification.of(filtroConcluidas, agora)
                .and((root, query, cb) -> cb.greaterThanOrEqualTo(root.get("fimReal"), agora.minusDays(30))));

        long aguardando = contarAguardandoAprovacao(abertas);
        return new PainelOrdensServicoResponse(pendentes, porCriticidade, agendadas, agendadasVencidas, emAndamento,
                atrasadas, concluidas, parados, aguardando);
    }

    /** Para a tela de abertura: itens já feitos recentemente na placa. */
    @Transactional(readOnly = true)
    public List<PreviaRepeticaoResponse> previaRepeticoes(UUID idVeiculo, List<UUID> idsItem) {
        if (idVeiculo == null || idsItem == null || idsItem.isEmpty()) return List.of();
        OffsetDateTime agora = OffsetDateTime.now();
        return itens.buscarEntidades(idsItem).stream()
                .map(item -> repeticoes.anterior(idVeiculo, item, null, agora)
                        .map(a -> new PreviaRepeticaoResponse(item.getId(), item.getNome(), MontadorOrdemServico.toResponse(a)))
                        .orElse(null))
                .filter(Objects::nonNull)
                .toList();
    }

    /** Fornecedores do financeiro que podem ser escolhidos como oficina externa. */
    @Transactional(readOnly = true)
    public List<FornecedorFrotaResponse> fornecedores() {
        return financeiro.fornecedoresUtilizaveis().stream()
                .map(f -> new FornecedorFrotaResponse(f.id(), f.nome())).toList();
    }

    /**
     * Valores que a OS já sabe para a compra ou o pagamento no financeiro. Chaves que a
     * variante escolhida não tiver são ignoradas pela tela.
     */
    @Transactional(readOnly = true)
    public PreenchimentoFinanceiroResponse preenchimentoFinanceiro(UUID id) {
        OrdemServico os = buscarEntidade(id);
        if (!os.aceitaOrcamento()) {
            throw new InvarianteVioladaException("A OS " + os.getNumero() + " está "
                    + os.getSituacao().getRotulo().toLowerCase() + " e não aceita novo orçamento.");
        }
        Map<String, Object> valores = new LinkedHashMap<>();
        Map<String, String> rotulos = new LinkedHashMap<>();
        if (os.isVeicular()) {
            valores.put("veiculoId", os.getIdVeiculo());
            rotulos.put("veiculoId", os.getPlaca());
            valores.put("regimeVeiculo", buscarFicha(os.getIdVeiculo()).getRegime().name());
        }
        if (os.getIdBaseOperacional() != null) {
            valores.put("baseId", os.getIdBaseOperacional());
            rotulos.put("baseId", referencias.nomesBases(List.of(os.getIdBaseOperacional())).get(os.getIdBaseOperacional()));
        }
        os.getItens().stream().findFirst()
                .ifPresent(item -> valores.put("naturezaServico", item.getItem().getNatureza().name()));
        if (os.getMotivo() != null) {
            valores.put("motivoServico", os.getMotivo().name());
        }
        if (os.getIdFornecedor() != null) {
            valores.put("fornecedorId", os.getIdFornecedor());
            rotulos.put("fornecedorId", financeiro.nomesFornecedores(List.of(os.getIdFornecedor())).get(os.getIdFornecedor()));
        } else if (os.getTipoOficina() == TipoOficina.EXTERNA && os.getOficinaNome() != null) {
            valores.put("fornecedorNome", os.getOficinaNome());
        }
        String itensTexto = String.join(", ", os.getItens().stream().map(i -> i.getItem().getNome()).toList());
        String descricao = "OS " + os.getNumero() + " — " + os.identificacao() + " — " + itensTexto + ": " + os.getDescricao();
        List<String> pecasCompra = os.getPecas().stream().filter(p -> p.getOrigem() == OrigemPeca.COMPRA)
                .map(p -> p.getQuantidade().stripTrailingZeros().toPlainString().replace('.', ',') + " " + p.getUnidade()
                        + " " + p.getDescricao() + (p.getCodigo() == null ? "" : " (" + p.getCodigo() + ")"))
                .toList();
        if (!pecasCompra.isEmpty()) {
            descricao += "\nPeças a comprar:\n- " + String.join("\n- ", pecasCompra);
        }
        valores.put("descricao", descricao);
        // Com lançamentos, a compra já nasce com o total calculado da execução.
        if (os.temLancamentos()) {
            valores.put("valor", os.totais().total());
            valores.put("quantidade", 1);
        }
        valores.put("observacoes", "Aberta pela OS " + os.getNumero() + " da frota.");
        rotulos.values().removeIf(Objects::isNull);
        // A variante FROTA exige veículo e regime; a OS sem veículo compra pela variante padrão.
        return new PreenchimentoFinanceiroResponse(ORIGEM_FINANCEIRO, "OS " + os.getNumero() + " — " + os.identificacao(),
                os.isVeicular() ? "FROTA" : "PADRAO", valores, rotulos);
    }

    // ── Ciclo de vida ──────────────────────────────────────────────────────────────

    @Transactional
    public OrdemServicoDetalheResponse abrir(AbrirOrdemServicoRequest request) {
        if (request.origem() == OrigemOrdemServico.SINISTRO) {
            throw new InvarianteVioladaException("A OS de sinistro é aberta pelo próprio sinistro.");
        }
        return abrirOrdem(request);
    }

    /** Reparo aberto pelo sinistro (origem {@code SINISTRO}); o vínculo fica no sinistro. */
    @Transactional
    OrdemServicoDetalheResponse abrirPeloSinistro(AbrirOrdemServicoRequest request) {
        return abrirOrdem(request);
    }

    private OrdemServicoDetalheResponse abrirOrdem(AbrirOrdemServicoRequest request) {
        if (request.idVeiculo() == null) {
            return abrirSemVeiculo(request);
        }
        FichaVeiculo ficha = buscarFicha(request.idVeiculo());
        OffsetDateTime abertaEm = request.abertaEm() != null ? request.abertaEm() : OffsetDateTime.now();
        UUID condutor = request.idCondutor() != null ? request.idCondutor()
                : condutores.condutorEm(request.idVeiculo(), abertaEm).orElse(null);
        exigirCondutor(request.idCondutor());
        UUID usuario = SecurityUtils.getUsuarioLogadoId();

        var os = OrdemServico.abrir(ficha, new OrdemServico.Abertura(request.tipoManutencao(), request.origem(),
                        request.criticidade(), request.motivo(), request.descricao(), condutor, abertaEm,
                        request.kmAbertura(), request.tipoOficina(), request.idFornecedor(), request.oficinaNome(),
                        request.veiculoParado()),
                itens.buscarEntidades(request.idsItem()), usuario);
        os = repository.saveAndFlush(os);

        List<String> avisos = new ArrayList<>();
        registrarKm(os, os.getKmAbertura(), abertaEm, os.getId(), "abertura", avisos);
        registrar(os, TipoEventoOrdemServico.ABERTA, os.getCriticidade().getRotulo() + " — " + os.getDescricao(), usuario);
        if (os.isVeiculoParado()) {
            registrar(os, TipoEventoOrdemServico.VEICULO_PARADO, "Veículo parado desde a abertura.", usuario);
        }
        sincronizarSituacaoVeiculo(os, ficha);

        avisarAbertura(os);
        return montador.detalhar(os, avisos);
    }

    /** Ferramental, oficina ou equipamento sem placa: sem medição, condutor nem veículo parado. */
    private OrdemServicoDetalheResponse abrirSemVeiculo(AbrirOrdemServicoRequest request) {
        if (request.descricaoEquipamento() == null || request.descricaoEquipamento().isBlank()) {
            throw new InvarianteVioladaException("Escolha o veículo ou, para manutenção sem veículo, informe o equipamento.");
        }
        OffsetDateTime abertaEm = request.abertaEm() != null ? request.abertaEm() : OffsetDateTime.now();
        UUID usuario = SecurityUtils.getUsuarioLogadoId();
        var os = OrdemServico.abrirSemVeiculo(request.idBaseOperacional(), request.descricaoEquipamento(),
                new OrdemServico.Abertura(request.tipoManutencao(), request.origem(), request.criticidade(),
                        request.motivo(), request.descricao(), request.idCondutor(), abertaEm, request.kmAbertura(),
                        request.tipoOficina(), request.idFornecedor(), request.oficinaNome(), request.veiculoParado()),
                itens.buscarEntidades(request.idsItem()), usuario);
        os = repository.saveAndFlush(os);
        registrar(os, TipoEventoOrdemServico.ABERTA, os.getCriticidade().getRotulo() + " — " + os.getDescricao()
                + " (sem veículo: " + os.getDescricaoEquipamento() + ")", usuario);
        avisarAbertura(os);
        return montador.detalhar(os, List.of());
    }

    private void avisarAbertura(OrdemServico os) {
        if (os.getOrigem() != OrigemOrdemServico.IMPORTACAO) {
            eventPublisher.publishEvent(new FrotaOrdemServicoAbertaEvent(os.getId(), os.getNumero(), os.identificacao(),
                    nomeBase(os), os.getCriticidade().name(), os.getCriticidade().getRotulo(),
                    os.getTipoManutencao().getRotulo(), os.getDescricao(), link(os)));
        }
    }

    @Transactional
    public OrdemServicoDetalheResponse editar(UUID id, EditarOrdemServicoRequest request) {
        OrdemServico os = buscarEntidade(id);
        exigirCondutor(request.idCondutor());
        // A origem sinistro nasce e fica com o sinistro: não entra nem sai pela edição.
        boolean deSinistro = os.getOrigem() == OrigemOrdemServico.SINISTRO;
        if (!deSinistro && request.origem() == OrigemOrdemServico.SINISTRO) {
            throw new InvarianteVioladaException("A OS de sinistro é aberta pelo próprio sinistro.");
        }
        var origem = deSinistro ? OrigemOrdemServico.SINISTRO : request.origem();
        os.editar(new OrdemServico.Edicao(request.tipoManutencao(), origem, request.criticidade(),
                        request.motivo(), request.descricao(), request.idCondutor(), request.tipoOficina(),
                        request.idFornecedor(), request.oficinaNome()),
                itens.buscarEntidades(request.idsItem()));
        repository.save(os);
        registrar(os, TipoEventoOrdemServico.EDITADA, "Dados da OS alterados.", SecurityUtils.getUsuarioLogadoId());
        return montador.detalhar(os, List.of());
    }

    /** Outro plano preventivo do mesmo veículo entra na OS preventiva que ainda não começou. */
    @Transactional
    public OrdemServicoDetalheResponse incluirPreventiva(UUID id, List<UUID> idsItem, String descricao,
                                                       Criticidade criticidade, String planos) {
        OrdemServico os = buscarEntidade(id);
        os.incluirPreventiva(itens.buscarEntidades(idsItem), descricao, criticidade);
        repository.save(os);
        registrar(os, TipoEventoOrdemServico.EDITADA, "Incluído na OS: " + planos + ".", SecurityUtils.getUsuarioLogadoId());
        return montador.detalhar(os, List.of());
    }

    @Transactional
    public OrdemServicoDetalheResponse agendar(UUID id, AgendarOrdemServicoRequest request) {
        OrdemServico os = buscarEntidade(id);
        boolean reagendamento = os.getSituacao() == SituacaoOrdemServico.AGENDADA;
        os.agendar(request.agendadaPara(), request.local());
        repository.save(os);
        String quando = formatar(os.getAgendadaPara());
        registrar(os, TipoEventoOrdemServico.AGENDADA, (reagendamento ? "Reagendada para " : "Agendada para ")
                + quando + (os.getLocalAgendamento() == null ? "" : " em " + os.getLocalAgendamento()) + ".",
                SecurityUtils.getUsuarioLogadoId());
        eventPublisher.publishEvent(new FrotaOrdemServicoAgendadaEvent(os.getId(), os.getNumero(), os.identificacao(),
                nomeBase(os), quando, os.getLocalAgendamento(), link(os)));
        return montador.detalhar(os, List.of());
    }

    @Transactional
    public OrdemServicoDetalheResponse iniciar(UUID id, IniciarOrdemServicoRequest request) {
        OrdemServico os = buscarEntidade(id);
        os.iniciar(request.inicioReal(), request.previsaoTermino());
        repository.save(os);
        registrar(os, TipoEventoOrdemServico.INICIADA, "Serviço iniciado em " + formatar(os.getInicioReal())
                + (os.getPrevisaoTermino() == null ? "." : ", previsão de término " + formatar(os.getPrevisaoTermino()) + "."),
                SecurityUtils.getUsuarioLogadoId());
        return montador.detalhar(os, List.of());
    }

    @Transactional
    public OrdemServicoDetalheResponse alterarPrevisao(UUID id, PrevisaoOrdemServicoRequest request) {
        OrdemServico os = buscarEntidade(id);
        os.alterarPrevisao(request.previsaoTermino());
        repository.save(os);
        registrar(os, TipoEventoOrdemServico.PREVISAO_ALTERADA, "Nova previsão de término: "
                + formatar(os.getPrevisaoTermino()) + ".", SecurityUtils.getUsuarioLogadoId());
        return montador.detalhar(os, List.of());
    }

    @Transactional
    public OrdemServicoDetalheResponse concluir(UUID id, ConcluirOrdemServicoRequest request) {
        OrdemServico os = buscarEntidade(id);
        UUID usuario = SecurityUtils.getUsuarioLogadoId();
        if (request.idsItem() != null && !request.idsItem().isEmpty()) {
            os.editar(new OrdemServico.Edicao(os.getTipoManutencao(), os.getOrigem(), os.getCriticidade(),
                            os.getMotivo(), os.getDescricao(), os.getIdCondutor(), os.getTipoOficina(),
                            os.getIdFornecedor(), os.getOficinaNome()),
                    itens.buscarEntidades(request.idsItem()));
        }
        boolean estavaParado = os.isParadaEmCurso();
        os.concluir(new OrdemServico.Encerramento(request.inicioReal(), request.fimReal(), request.descricaoServico(),
                request.itensSubstituidos(), request.valorTotal(), request.kmEncerramento(), request.tipoOficina(),
                request.idFornecedor(), request.oficinaNome(), request.causa()));
        List<ItemOrdemServico> repetidos = repeticoes.registrar(os);
        repository.save(os);
        preventivas.aoConcluir(os);
        eventPublisher.publishEvent(new AnaliseIaPedida(AlvoAnaliseIa.ORDEM_SERVICO, os.getId()));

        List<String> avisos = new ArrayList<>();
        registrarKm(os, os.getKmEncerramento(), os.getFimReal(), os.getIdLeituraEncerramento(), "encerramento", avisos);
        registrar(os, TipoEventoOrdemServico.CONCLUIDA, "Serviço de " + formatar(os.getInicioReal()) + " a "
                + formatar(os.getFimReal()) + ": " + os.getDescricaoServico(), usuario);
        if (estavaParado) {
            registrar(os, TipoEventoOrdemServico.VEICULO_LIBERADO, "Veículo liberado no encerramento.", usuario);
        }
        sincronizarSituacaoVeiculo(os, null);

        for (ItemOrdemServico item : repetidos) {
            avisos.add(item.getItem().getNome() + " repete a OS " + item.getNumeroOsAnterior() + ", concluída "
                    + item.getDiasDesdeAnterior() + " dias antes.");
            if (os.getOrigem() != OrigemOrdemServico.IMPORTACAO) {
                eventPublisher.publishEvent(new FrotaManutencaoRepetidaEvent(os.getId(), item.getItem().getId(),
                        os.getNumero(), os.identificacao(), item.getItem().getNome(), item.getNumeroOsAnterior(),
                        item.getDiasDesdeAnterior(), link(os)));
            }
        }
        return montador.detalhar(os, avisos);
    }

    @Transactional
    public OrdemServicoDetalheResponse cancelar(UUID id, String motivo) {
        OrdemServico os = buscarEntidade(id);
        exigirSemOrcamentoPendente(os);
        boolean estavaParado = os.isParadaEmCurso();
        UUID usuario = SecurityUtils.getUsuarioLogadoId();
        os.cancelar(motivo, OffsetDateTime.now());
        repository.save(os);
        preventivas.aoCancelar(os);
        registrar(os, TipoEventoOrdemServico.CANCELADA, os.getMotivoCancelamento(), usuario);
        if (estavaParado) {
            registrar(os, TipoEventoOrdemServico.VEICULO_LIBERADO, "Veículo liberado no cancelamento.", usuario);
        }
        sincronizarSituacaoVeiculo(os, null);
        return montador.detalhar(os, List.of());
    }

    @Transactional
    public OrdemServicoDetalheResponse alterarParada(UUID id, ParadaVeiculoRequest request) {
        OrdemServico os = buscarEntidade(id);
        OffsetDateTime instante = request.instante() != null ? request.instante() : OffsetDateTime.now();
        UUID usuario = SecurityUtils.getUsuarioLogadoId();
        if (Boolean.TRUE.equals(request.parado())) {
            if (os.isParadaEmCurso()) return montador.detalhar(os, List.of());
            os.marcarVeiculoParado(instante);
            registrar(os, TipoEventoOrdemServico.VEICULO_PARADO, "Veículo parado desde " + formatar(os.getParadoDesde()) + ".", usuario);
        } else {
            os.liberarVeiculo(instante);
            registrar(os, TipoEventoOrdemServico.VEICULO_LIBERADO, "Veículo liberado em " + formatar(instante) + ".", usuario);
        }
        repository.save(os);
        sincronizarSituacaoVeiculo(os, null);
        return montador.detalhar(os, List.of());
    }

    /** Publica um aviso por OS em andamento que passou da previsão (uma vez por previsão). */
    @Transactional
    public int avisarPrazosEstourados(OffsetDateTime agora) {
        int avisadas = 0;
        for (OrdemServico os : repository.findAllBySituacaoAndPrevisaoTerminoBeforeAndAtivoTrue(
                SituacaoOrdemServico.EM_ANDAMENTO, agora)) {
            if (!os.precisaAvisarPrazo(agora)) continue;
            os.registrarAvisoPrazo();
            repository.save(os);
            eventPublisher.publishEvent(new FrotaPrazoOsEstouradoEvent(os.getId(), os.getNumero(), os.identificacao(),
                    nomeBase(os), formatar(os.getPrevisaoTermino()), link(os)));
            avisadas++;
        }
        return avisadas;
    }

    // ── Apoio ──────────────────────────────────────────────────────────────────────

    OrdemServico buscarEntidade(UUID id) {
        return repository.findById(id)
                .filter(OrdemServico::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Ordem de serviço não encontrada."));
    }

    void registrar(OrdemServico os, TipoEventoOrdemServico tipo, String descricao, UUID usuario) {
        historicoRepository.save(new EventoOrdemServico(os.getId(), tipo, descricao, usuario, OffsetDateTime.now()));
    }

    static String link(OrdemServico os) {
        return "/frota/ordens-servico/" + os.getId();
    }

    static String formatar(OffsetDateTime instante) {
        return instante == null ? null : DATA_HORA.format(instante.atZoneSameInstant(FUSO));
    }

    private FichaVeiculo buscarFicha(UUID idVeiculo) {
        return fichaRepository.findByIdVeiculo(idVeiculo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Veículo não encontrado na frota."));
    }

    private void exigirCondutor(UUID idCondutor) {
        if (idCondutor != null && !referencias.colaboradorAtivo(idCondutor)) {
            throw new InvarianteVioladaException("Condutor não encontrado ou desativado.");
        }
    }

    /**
     * Ficha em manutenção enquanto alguma OS aberta mantém o veículo parado; senão, volta
     * a ativo (só se ainda estava em manutenção).
     */
    private void sincronizarSituacaoVeiculo(OrdemServico os, FichaVeiculo carregada) {
        if (!os.isVeicular()) return;
        FichaVeiculo ficha = carregada != null ? carregada : buscarFicha(os.getIdVeiculo());
        boolean parado = os.isParadaEmCurso()
                || repository.existeOutraParadaEmCurso(os.getIdVeiculo(), os.getId(), SituacaoOrdemServico.ABERTAS);
        if (parado) {
            ficha.entrarEmManutencao();
        } else {
            ficha.sairDaManutencao();
        }
        fichaRepository.save(ficha);
    }

    private void registrarKm(OrdemServico os, Long km, OffsetDateTime lidoEm, UUID idOrigem, String momento,
                             List<String> avisos) {
        if (km == null) return;
        var resultado = odometro.registrarLeitura(os.getIdVeiculo(), km, lidoEm,
                FrotaOdometroApi.OrigemLeitura.MANUTENCAO, idOrigem, SecurityUtils.getUsuarioLogadoId());
        if (!resultado.valida()) {
            String medicao = os.getUnidadeMedicao() == UnidadeMedicao.HORAS ? "O horímetro" : "O KM";
            avisos.add(medicao + " da " + momento + " foi gravado como inconsistente: " + resultado.motivoInconsistencia()
                    + " Confira na conferência de KM.");
        }
    }

    private void exigirSemOrcamentoPendente(OrdemServico os) {
        var ids = solicitacaoRepository.findAllByIdOrdemServicoAndAtivoTrueOrderByDataCriacaoAsc(os.getId()).stream()
                .map(SolicitacaoOrdemServico::getIdSolicitacao).toList();
        financeiro.resumosSolicitacoes(ids).values().stream()
                .filter(r -> SituacaoAprovacaoOrcamento.pendente(r.status()))
                .findFirst()
                .ifPresent(r -> {
                    throw new InvarianteVioladaException("A " + ("PAGAMENTO".equals(r.tipo()) ? "solicitação de pagamento"
                            : "solicitação de compra") + " nº " + r.numero() + " ainda está "
                            + ("RASCUNHO".equals(r.status()) ? "em rascunho" : "aguardando aprovação")
                            + ". Cancele-a ou aguarde a decisão no financeiro antes de cancelar a OS.");
                });
    }

    private long contarAguardandoAprovacao(List<OrdemServico> abertas) {
        if (abertas.isEmpty()) return 0;
        var vinculos = solicitacaoRepository.findAllByIdOrdemServicoInAndAtivoTrue(
                abertas.stream().map(OrdemServico::getId).toList());
        Map<UUID, ResumoSolicitacaoFinanceira> resumos = financeiro.resumosSolicitacoes(
                vinculos.stream().map(SolicitacaoOrdemServico::getIdSolicitacao).toList());
        return vinculos.stream()
                .filter(v -> resumos.containsKey(v.getIdSolicitacao())
                        && "SOLICITADO".equals(resumos.get(v.getIdSolicitacao()).status()))
                .map(SolicitacaoOrdemServico::getIdOrdemServico)
                .distinct()
                .count();
    }

    private String nomeBase(OrdemServico os) {
        return os.getIdBaseOperacional() == null ? null
                : referencias.nomesBases(List.of(os.getIdBaseOperacional())).get(os.getIdBaseOperacional());
    }
}
