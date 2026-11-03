package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.ConsumoAbastecimentoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.LocalAbastecimento;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimentoGeo;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository;
import com.nexo.app.modules.frota.application.dto.FichaVeiculoFilter;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.ContagemTipo;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.EstadoMapa;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.MapaResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.AbastecimentoMapa;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.AtencaoVeiculoMapa;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.OsMapa;
import com.nexo.app.modules.frota.application.dto.VeiculoSemChecklistResponse;
import com.nexo.app.modules.frota.domain.Condutor;
import com.nexo.app.modules.frota.domain.Expediente;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.PendenciaChecklist;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist;
import com.nexo.app.modules.frota.infrastructure.persistence.CondutorRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PendenciaChecklistRepository;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.VeiculoMapa;
import com.nexo.app.modules.frota.application.dto.VeiculoFrotaResumoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.EventoFilter;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.EventoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.Ponto;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.ProvedorSituacao;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.RastreadorFilter;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.RastreadorResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.Resumo;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.Rotina;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.SituacaoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.TrajetoResponse;
import com.nexo.app.modules.frota.application.dto.TelemetriaFrotaDtos.VeiculoResponse;
import com.nexo.app.modules.frota.domain.Abastecimento;
import com.nexo.app.modules.frota.domain.EventoTelemetria;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.FonteTelemetria;
import com.nexo.app.modules.frota.domain.ItemAbastecimento;
import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import com.nexo.app.modules.frota.domain.RastreadorTelemetria;
import com.nexo.app.modules.frota.domain.RotinaTelemetria;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import com.nexo.app.modules.frota.domain.SituacaoRastreador;
import com.nexo.app.modules.frota.domain.SituacaoSincronizacaoTelemetria;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;
import com.nexo.app.modules.frota.infrastructure.persistence.AbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.EventoTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PosicaoTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RastreadorTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SincronizacaoTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.TelemetriaSpecification;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Consulta da telemetria (situação dos provedores, rastreadores, eventos, resumo do veículo e
 * consumo) e as ações do gestor sobre os rastreadores.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TelemetriaFrotaUseCases {

    static final Duration SEM_COMUNICACAO = Duration.ofHours(24);
    /**
     * Velocidade e ignição só descrevem o agora se a posição for recente: muitos rastreadores param
     * de transmitir ao desligar, e a última leitura fica "andando" para sempre.
     */
    static final Duration ESTADO_ATUAL = Duration.ofMinutes(30);
    /** As posições chegam a cada 2 minutos; sem chegar há mais que isto, o mapa avisa. */
    static final Duration POSICOES_ATRASADAS = Duration.ofMinutes(15);
    static final int MAXIMO_PONTOS_TRAJETO = 3000;
    static final int MAXIMO_DIAS_TRAJETO = 7;
    private static final double MINIMO_KM_CONSUMO = 100;
    private static final double MINIMO_HORAS_CONSUMO = 10;

    private final RastreadorTelemetriaRepository rastreadores;
    private final EventoTelemetriaRepository eventos;
    private final SincronizacaoTelemetriaRepository sincronizacoes;
    private final PosicaoTelemetriaRepository posicoes;
    private final FichaVeiculoRepository fichas;
    private final AbastecimentoRepository abastecimentos;
    private final ReferenciasFrota referencias;
    private final SincronizacaoTelemetriaUseCases sincronizacao;
    private final VeiculoFrotaUseCases veiculos;
    private final AnaliseTelemetriaRepository analises;
    private final OrdemServicoRepository ordens;
    private final PendenciaChecklistRepository pendenciasChecklist;
    private final CondutorRepository condutores;
    private final ChecklistConsultaUseCases checklists;
    private final ParametrosFrotaUseCases parametros;
    private final List<FonteTelemetria> fontes;

    // ── Situação ────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public SituacaoResponse situacao() {
        var agora = OffsetDateTime.now();
        var provedores = new ArrayList<ProvedorSituacao>();
        for (ProvedorTelemetria p : ProvedorTelemetria.values()) {
            boolean configurado = sincronizacao.configurado(p);
            provedores.add(new ProvedorSituacao(p, p.getRotulo(), configurado,
                    rotina(p, RotinaTelemetria.VEICULOS, configurado), rotina(p, RotinaTelemetria.EVENTOS, configurado)));
        }
        var resumo = new Resumo(
                rastreadores.countBySituacaoAndAtivoTrue(SituacaoRastreador.VINCULADO),
                rastreadores.countBySituacaoAndAtivoTrue(SituacaoRastreador.SEM_VEICULO),
                rastreadores.countBySituacaoAndAtivoTrue(SituacaoRastreador.IGNORADO),
                rastreadores.contarVinculadosSemComunicacaoDesde(agora.minus(SEM_COMUNICACAO)),
                eventos.countByOcorridoEmGreaterThanEqualAndAtivoTrue(agora.minusHours(24)));
        return new SituacaoResponse(provedores, resumo);
    }

    private Rotina rotina(ProvedorTelemetria provedor, RotinaTelemetria rotina, boolean configurado) {
        var s = sincronizacoes.findByProvedorAndRotina(provedor, rotina).orElse(null);
        if (!configurado || s == null) {
            var situacao = configurado ? SituacaoSincronizacaoTelemetria.OK : SituacaoSincronizacaoTelemetria.NAO_CONFIGURADO;
            String rotulo = configurado ? "Aguardando a primeira sincronização" : situacao.getRotulo();
            return new Rotina(situacao, rotulo, s == null ? null : s.getUltimaExecucao(), s == null ? null : s.getUltimoSucesso(),
                    null, 0, s == null ? 0 : s.getItens());
        }
        return new Rotina(s.getSituacao(), s.getSituacao().getRotulo(), s.getUltimaExecucao(), s.getUltimoSucesso(),
                s.getMensagem(), s.getFalhasSeguidas(), s.getItens());
    }

    /** "Sincronizar agora": roda as duas rotinas e devolve a situação. */
    public SituacaoResponse sincronizarAgora() {
        sincronizacao.sincronizarVeiculos();
        sincronizacao.sincronizarEventos();
        return situacao();
    }

    // ── Rastreadores ────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<RastreadorResponse> listarRastreadores(RastreadorFilter filtro, Pageable pageable) {
        var agora = OffsetDateTime.now();
        var spec = TelemetriaSpecification.rastreadores(filtro, idsVeiculoPorBusca(filtro == null ? null : filtro.busca()),
                idsVeiculoPorBase(filtro == null ? null : filtro.idsBase()), agora.minus(SEM_COMUNICACAO));
        Page<RastreadorTelemetria> pagina = rastreadores.findAll(spec, ordenado(pageable,
                Sort.by(Sort.Order.asc("situacao"), Sort.Order.desc("ultimaComunicacao").nullsLast())));
        var respostas = montarRastreadores(pagina.getContent(), agora);
        return PageResponse.fromPage(pagina.map(r -> respostas.get(r.getId())));
    }

    @Transactional(readOnly = true)
    public RastreadorResponse detalharRastreador(UUID id) {
        var r = buscarRastreador(id);
        return montarRastreadores(List.of(r), OffsetDateTime.now()).get(id);
    }

    @Transactional
    public RastreadorResponse vincular(UUID id, UUID idVeiculo) {
        var r = buscarRastreador(id);
        var ficha = fichas.findByIdVeiculo(idVeiculo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Veículo não encontrado na frota."));
        if (!ficha.isAtivo()) {
            throw new InvarianteVioladaException("O veículo " + ficha.getPlaca() + " está desativado.");
        }
        r.vincularManualmente(idVeiculo);
        if (ficha.associarRastreador(r.getProvedor(), r.getIdExterno())) {
            fichas.save(ficha);
        }
        return montarRastreadores(List.of(rastreadores.save(r)), OffsetDateTime.now()).get(id);
    }

    @Transactional
    public RastreadorResponse desfazerVinculo(UUID id) {
        var r = buscarRastreador(id);
        r.desfazerVinculoManual();
        return montarRastreadores(List.of(rastreadores.save(r)), OffsetDateTime.now()).get(id);
    }

    @Transactional
    public RastreadorResponse ignorar(UUID id) {
        var r = buscarRastreador(id);
        r.ignorar();
        return montarRastreadores(List.of(rastreadores.save(r)), OffsetDateTime.now()).get(id);
    }

    @Transactional
    public RastreadorResponse reativar(UUID id) {
        var r = buscarRastreador(id);
        r.reativar();
        return montarRastreadores(List.of(rastreadores.save(r)), OffsetDateTime.now()).get(id);
    }

    // ── Eventos ─────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<EventoResponse> listarEventos(EventoFilter filtro, Pageable pageable) {
        String busca = filtro == null ? null : filtro.busca();
        var spec = TelemetriaSpecification.eventos(filtro, idsVeiculoPorBusca(busca),
                busca == null || busca.isBlank() ? null : referencias.idsColaboradoresPorNome(busca.trim()),
                idsVeiculoPorBase(filtro == null ? null : filtro.idsBase()));
        Page<EventoTelemetria> pagina = eventos.findAll(spec, ordenado(pageable, Sort.by(Sort.Order.desc("ocorridoEm"))));
        var respostas = montarEventos(pagina.getContent());
        return PageResponse.fromPage(pagina.map(e -> respostas.get(e.getId())));
    }

    @Transactional(readOnly = true)
    public EventoResponse detalharEvento(UUID id) {
        var e = eventos.findById(id).filter(EventoTelemetria::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Evento de telemetria não encontrado."));
        return montarEventos(List.of(e)).get(id);
    }

    // ── Veículo ─────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public VeiculoResponse veiculo(UUID idVeiculo) {
        var ficha = fichas.findByIdVeiculo(idVeiculo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Veículo não encontrado na frota."));
        var agora = OffsetDateTime.now();
        var doVeiculo = rastreadores.findAllByIdVeiculoAndAtivoTrueOrderByUltimaComunicacaoDesc(idVeiculo).stream()
                .filter(RastreadorTelemetria::isVinculado).toList();
        var unidade = ficha.getUnidadeMedicao();
        if (doVeiculo.isEmpty()) {
            return new VeiculoResponse(false, null, List.of(), unidade, null, null, null, null, List.of(), List.of());
        }
        var montados = montarRastreadores(doVeiculo, agora);
        var principal = principal(doVeiculo);
        var outros = doVeiculo.stream().filter(r -> !r.getId().equals(principal.getId())).map(r -> montados.get(r.getId())).toList();
        boolean horas = unidade == UnidadeMedicao.HORAS;
        Double rodado7d = rodado(principal, agora.minusDays(7), agora, horas).orElse(null);
        Double rodado30d = rodado(principal, agora.minusDays(30), agora, horas).orElse(null);
        var realizados = abastecimentos.realizadosEntre(idVeiculo, agora.minusDays(30), agora);
        BigDecimal litros = realizados.stream().map(TelemetriaFrotaUseCases::litros).reduce(BigDecimal.ZERO, BigDecimal::add);
        Double consumo = null;
        double minimo = horas ? MINIMO_HORAS_CONSUMO : MINIMO_KM_CONSUMO;
        if (realizados.size() >= 2 && rodado30d != null && rodado30d >= minimo && litros.signum() > 0) {
            consumo = horas ? arredondar(litros.doubleValue() / rodado30d) : arredondar(rodado30d / litros.doubleValue());
        }
        var contagem = eventos.contarPorTipoDoVeiculo(idVeiculo, agora.minusDays(30)).stream()
                .sorted(Comparator.comparing(c -> c.getTipo().ordinal()))
                .map(c -> new ContagemTipo(c.getTipo(), c.getTipo().getRotulo(), c.getTotal())).toList();
        var ultimos = eventos.findTop10ByIdVeiculoAndAtivoTrueOrderByOcorridoEmDesc(idVeiculo);
        var eventosMontados = montarEventos(ultimos);
        return new VeiculoResponse(true, montados.get(principal.getId()), outros, unidade, rodado7d, rodado30d,
                litros.signum() == 0 ? null : litros, consumo, contagem,
                ultimos.stream().map(e -> eventosMontados.get(e.getId())).toList());
    }

    /**
     * O trajeto vem do histórico do provedor (um ponto a cada ~30 s, que segue a via); se o provedor
     * não responder, das posições gravadas aqui (uma a cada 2 minutos). Sem transação: a chamada ao
     * provedor não segura conexão do banco.
     */
    public TrajetoResponse trajeto(UUID idVeiculo, OffsetDateTime de, OffsetDateTime ate) {
        if (de == null || ate == null || !ate.isAfter(de)) {
            throw new InvarianteVioladaException("Informe o período: o fim precisa ser depois do início.");
        }
        if (ChronoUnit.DAYS.between(de, ate) > MAXIMO_DIAS_TRAJETO) {
            throw new InvarianteVioladaException("O trajeto mostra no máximo " + MAXIMO_DIAS_TRAJETO + " dias por vez.");
        }
        var vinculados = vinculados(idVeiculo);
        var doProvedor = vinculados.isEmpty() ? null : historicoDoProvedor(vinculados.getFirst(), de, ate);
        if (doProvedor != null) {
            return new TrajetoResponse(espacar(doProvedor, MAXIMO_PONTOS_TRAJETO).stream()
                    .map(l -> new Ponto(l.lidoEm(), l.latitude(), l.longitude(), l.velocidadeKmh(), l.ignicao())).toList(), false);
        }
        var ids = vinculados.stream().map(RastreadorTelemetria::getId).toList();
        var pontos = posicoes.trajeto(ids, de, ate, MAXIMO_PONTOS_TRAJETO + 1);
        boolean truncado = pontos.size() > MAXIMO_PONTOS_TRAJETO;
        return new TrajetoResponse((truncado ? pontos.subList(0, MAXIMO_PONTOS_TRAJETO) : pontos).stream()
                .map(p -> new Ponto(p.lidoEm(), p.latitude(), p.longitude(), p.velocidadeKmh(), p.ignicao())).toList(), truncado);
    }

    /**
     * Trajeto do veículo pelo histórico do provedor, espaçado até o máximo do mapa, ou {@code null}
     * quando o provedor não tem ou não responde (quem chama fica com as posições gravadas aqui).
     */
    List<FonteTelemetria.Leitura> historicoDoVeiculo(UUID idVeiculo, OffsetDateTime de, OffsetDateTime ate) {
        var vinculados = vinculados(idVeiculo);
        var doProvedor = vinculados.isEmpty() ? null : historicoDoProvedor(vinculados.getFirst(), de, ate);
        return doProvedor == null ? null : espacar(doProvedor, MAXIMO_PONTOS_TRAJETO);
    }

    private List<RastreadorTelemetria> vinculados(UUID idVeiculo) {
        return rastreadores.findAllByIdVeiculoAndAtivoTrueOrderByUltimaComunicacaoDesc(idVeiculo).stream()
                .filter(RastreadorTelemetria::isVinculado).toList();
    }

    /** Leituras do provedor no período, ou {@code null} para cair nas posições gravadas aqui. */
    private List<FonteTelemetria.Leitura> historicoDoProvedor(RastreadorTelemetria rastreador, OffsetDateTime de, OffsetDateTime ate) {
        var fonte = fontes == null ? null : fontes.stream().filter(f -> f.provedor() == rastreador.getProvedor() && f.configurada())
                .findFirst().orElse(null);
        if (fonte == null) {
            return null;
        }
        try {
            var leituras = fonte.historico(rastreador.getIdExterno(), rastreador.getPlacaProvedor(), de, ate);
            if (leituras == null) {
                return null;
            }
            var noPeriodo = leituras.stream().filter(l -> !l.lidoEm().isBefore(de) && !l.lidoEm().isAfter(ate)).toList();
            return noPeriodo.size() < 2 ? null : noPeriodo;
        } catch (RuntimeException e) {
            log.warn("Histórico de posições do {} indisponível; trajeto pelas posições gravadas: {}", rastreador.getProvedor(), e.getMessage());
            return null;
        }
    }

    /** Até {@code maximo} pontos espalhados pelo período inteiro, sempre com o primeiro e o último. */
    static <T> List<T> espacar(List<T> pontos, int maximo) {
        if (pontos.size() <= maximo) {
            return pontos;
        }
        var resultado = new java.util.ArrayList<T>(maximo);
        double passo = (pontos.size() - 1) / (double) (maximo - 1);
        for (int i = 0; i < maximo; i++) {
            resultado.add(pontos.get((int) Math.round(i * passo)));
        }
        return resultado;
    }

    // ── Mapa da frota ───────────────────────────────────────────────────────────────

    /**
     * Cada veículo rastreado com posição, no estado atual e com o que a frota sabe dele. Com dois
     * rastreadores no mesmo veículo, vale o que comunicou por último.
     */
    @Transactional(readOnly = true)
    public MapaResponse mapa(List<UUID> idsBase) {
        var agora = OffsetDateTime.now();
        var resumos = veiculos.listar(new FichaVeiculoFilter(null, idsBase, null, null, null, true), PageRequest.of(0, 2000))
                .getContent().stream().collect(Collectors.toMap(VeiculoFrotaResumoResponse::idVeiculo, Function.identity(), (a, b) -> a));
        Map<UUID, RastreadorTelemetria> porVeiculo = new java.util.HashMap<>();
        for (var r : resumos.isEmpty() ? List.<RastreadorTelemetria>of() : rastreadores.findAllByIdVeiculoInAndAtivoTrue(resumos.keySet())) {
            if (!r.isVinculado()) continue;
            porVeiculo.merge(r.getIdVeiculo(), r, (a, b) -> comunicouDepois(b, a) ? b : a);
        }
        var eventos24h = eventos.contarPorVeiculoDesde(agora.minusHours(24)).stream()
                .collect(Collectors.toMap(EventoTelemetriaRepository.ContagemVeiculo::getIdVeiculo,
                        EventoTelemetriaRepository.ContagemVeiculo::getTotal));
        var nomes = referencias.nomesColaboradores(porVeiculo.values().stream()
                .map(RastreadorTelemetria::getIdColaboradorMotorista).filter(Objects::nonNull).collect(Collectors.toSet()));
        var atencao = atencaoDoMapa(resumos, idsBase, agora);
        var lista = new ArrayList<VeiculoMapa>();
        long semPosicao = 0;
        for (var r : porVeiculo.values()) {
            if (r.getLatitude() == null || r.getLongitude() == null) {
                semPosicao++;
                continue;
            }
            var v = resumos.get(r.getIdVeiculo());
            var estado = estado(r, agora);
            lista.add(new VeiculoMapa(v.idVeiculo(), v.placa(), v.modelo(), v.fabricante(), v.tipoVeiculo(),
                    v.idBaseOperacional(), v.baseOperacional(), v.situacao(), v.situacao() == null ? null : v.situacao().getRotulo(),
                    r.getLatitude(), r.getLongitude(), r.getVelocidadeKmh(), r.getIgnicao(),
                    r.getUltimaComunicacao(), estado, estado.getRotulo(),
                    r.getIdColaboradorMotorista() == null ? null : nomes.get(r.getIdColaboradorMotorista()),
                    v.condutorAtual(), v.kmAtual(), v.unidadeMedicao(), eventos24h.getOrDefault(v.idVeiculo(), 0L),
                    v.documentosVencidos(), atencao.apply(v.idVeiculo(), estado)));
        }
        lista.sort(Comparator.comparing((VeiculoMapa m) -> m.estado().ordinal()).thenComparing(VeiculoMapa::placa));
        return new MapaResponse(lista, semPosicao, agora, posicoesAtrasadasDesde(agora));
    }

    /**
     * Monta, em poucas consultas para a frota toda, o que pede decisão em cada veículo do mapa.
     * Devolve a função que fecha o quadro com o estado do rastreador (andar fora do expediente).
     */
    private java.util.function.BiFunction<UUID, EstadoMapa, AtencaoVeiculoMapa> atencaoDoMapa(
            Map<UUID, VeiculoFrotaResumoResponse> resumos, List<UUID> idsBase, OffsetDateTime agora) {
        var ids = resumos.keySet();
        if (ids.isEmpty()) {
            return (id, estado) -> null;
        }
        Map<UUID, List<OrdemServico>> osPorVeiculo = ordens.findAllByIdVeiculoInAndSituacaoInAndAtivoTrue(ids, SituacaoOrdemServico.ABERTAS)
                .stream().collect(Collectors.groupingBy(OrdemServico::getIdVeiculo));
        Map<UUID, Long> pendencias = pendenciasChecklist.findAllByIdVeiculoInAndSituacaoAndAtivoTrue(ids, SituacaoPendenciaChecklist.ABERTA)
                .stream().collect(Collectors.groupingBy(PendenciaChecklist::getIdVeiculo, Collectors.counting()));
        Map<UUID, Abastecimento> abastecimentosAbertos = abastecimentos
                .findAllByIdVeiculoInAndSituacaoInAndAtivoTrue(ids, SituacaoAbastecimento.EM_ANDAMENTO).stream()
                .collect(Collectors.toMap(Abastecimento::getIdVeiculo, Function.identity(), (a, b) -> a));
        Set<UUID> semChecklist = checklists.semChecklistHoje(idsBase).stream()
                .map(VeiculoSemChecklistResponse::idVeiculo).collect(Collectors.toSet());
        var idsCondutor = resumos.values().stream().map(VeiculoFrotaResumoResponse::idCondutorAtual).filter(Objects::nonNull).collect(Collectors.toSet());
        var hoje = agora.atZoneSameInstant(Expediente.FUSO).toLocalDate();
        Set<UUID> cnhVencida = idsCondutor.isEmpty() ? Set.of() : condutores.findAllByIdColaboradorIn(idsCondutor).stream()
                .filter(c -> c.isAtivo() && c.isCnhVencidaEm(hoje)).map(Condutor::getIdColaborador).collect(Collectors.toSet());
        boolean dentroDoExpediente = parametros.obter().expediente().dentro(agora);

        return (id, estado) -> {
            var resumo = resumos.get(id);
            var abertas = osPorVeiculo.getOrDefault(id, List.of());
            var os = abertas.stream().min(Comparator.comparing((OrdemServico o) -> !o.isVeiculoParado())
                            .thenComparing(o -> !atrasada(o, agora))
                            .thenComparing(OrdemServico::getAbertaEm))
                    .map(o -> new OsMapa(o.getId(), o.getNumero(), o.getSituacao().getRotulo(), o.isVeiculoParado(), atrasada(o, agora)))
                    .orElse(null);
            var abastecimento = abastecimentosAbertos.get(id);
            return new AtencaoVeiculoMapa(resumo.idCondutorAtual(),
                    resumo.idCondutorAtual() != null && cnhVencida.contains(resumo.idCondutorAtual()), os, abertas.size(),
                    pendencias.getOrDefault(id, 0L), semChecklist.contains(id),
                    abastecimento == null ? null
                            : new AbastecimentoMapa(abastecimento.getId(), abastecimento.getSituacao(), abastecimento.getSituacao().getRotulo()),
                    estado == EstadoMapa.EM_MOVIMENTO && !dentroDoExpediente);
        };
    }

    private static boolean atrasada(OrdemServico o, OffsetDateTime agora) {
        return o.getSituacao() == SituacaoOrdemServico.EM_ANDAMENTO && o.getPrevisaoTermino() != null && o.getPrevisaoTermino().isBefore(agora);
    }

    /**
     * Desde quando as posições não chegam: a última leitura bem-sucedida mais antiga entre os
     * provedores ligados, se passou de {@link #POSICOES_ATRASADAS}. Nulo quando tudo chega em dia.
     */
    OffsetDateTime posicoesAtrasadasDesde(OffsetDateTime agora) {
        OffsetDateTime desde = null;
        for (ProvedorTelemetria p : ProvedorTelemetria.values()) {
            if (!sincronizacao.configurado(p)) continue;
            var s = sincronizacoes.findByProvedorAndRotina(p, RotinaTelemetria.VEICULOS).orElse(null);
            if (s == null || s.getUltimoSucesso() == null) continue;
            if (s.getUltimoSucesso().isBefore(agora.minus(POSICOES_ATRASADAS))
                    && (desde == null || s.getUltimoSucesso().isBefore(desde))) {
                desde = s.getUltimoSucesso();
            }
        }
        return desde;
    }

    static EstadoMapa estado(RastreadorTelemetria r, OffsetDateTime agora) {
        if (r.getUltimaComunicacao() == null || r.getUltimaComunicacao().isBefore(agora.minus(SEM_COMUNICACAO))) {
            return EstadoMapa.SEM_SINAL;
        }
        if (r.getUltimaComunicacao().isBefore(agora.minus(ESTADO_ATUAL))) {
            return EstadoMapa.DESLIGADO;
        }
        boolean andando = r.getVelocidadeKmh() != null && r.getVelocidadeKmh().doubleValue() > RastreadorTelemetria.VELOCIDADE_MOVIMENTO_KMH;
        if (andando) {
            return EstadoMapa.EM_MOVIMENTO;
        }
        return Boolean.TRUE.equals(r.getIgnicao()) ? EstadoMapa.LIGADO_PARADO : EstadoMapa.DESLIGADO;
    }

    private static boolean comunicouDepois(RastreadorTelemetria a, RastreadorTelemetria b) {
        if (a.getUltimaComunicacao() == null) return false;
        return b.getUltimaComunicacao() == null || a.getUltimaComunicacao().isAfter(b.getUltimaComunicacao());
    }

    // ── Abastecimento ───────────────────────────────────────────────────────────────

    /**
     * Rodado pela telemetria entre o abastecimento anterior realizado e este, e o consumo do
     * intervalo (os litros deste abastecimento repõem o que foi gasto desde o anterior).
     */
    @Transactional(readOnly = true)
    public ConsumoAbastecimentoResponse consumoAbastecimento(UUID idAbastecimento) {
        return consumo(idAbastecimento).comLocal(local(idAbastecimento));
    }

    /** Onde o veículo estava no abastecimento, pela análise que o job grava depois de realizado. */
    private LocalAbastecimento local(UUID idAbastecimento) {
        var a = analises.buscarAbastecimento(idAbastecimento).orElse(null);
        if (a == null || a.latitude() == null || a.longitude() == null) return null;
        var posto = a.idPosto() == null ? null : analises.listarPostos().stream()
                .filter(p -> p.idPosto().equals(a.idPosto())).findFirst().orElse(null);
        return new LocalAbastecimento(a.latitude(), a.longitude(), posto == null ? null : posto.latitude(),
                posto == null ? null : posto.longitude(), a.distanciaPostoMetros(),
                SituacaoAbastecimentoGeo.LONGE_DO_POSTO.name().equals(a.situacao()));
    }

    private ConsumoAbastecimentoResponse consumo(UUID idAbastecimento) {
        Abastecimento atual = abastecimentos.findById(idAbastecimento)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Abastecimento não encontrado."));
        var ficha = fichas.findByIdVeiculo(atual.getIdVeiculo()).orElse(null);
        UnidadeMedicao unidade = ficha == null ? UnidadeMedicao.KM : ficha.getUnidadeMedicao();
        if (atual.getSituacao() != SituacaoAbastecimento.REALIZADA || atual.getRealizadoEm() == null) {
            return indisponivel("O consumo aparece depois que o abastecimento é realizado.", unidade);
        }
        var doVeiculo = rastreadores.findAllByIdVeiculoAndAtivoTrueOrderByUltimaComunicacaoDesc(atual.getIdVeiculo()).stream()
                .filter(RastreadorTelemetria::isVinculado).toList();
        if (doVeiculo.isEmpty()) {
            return indisponivel("O veículo não tem rastreador vinculado.", unidade);
        }
        var anterior = abastecimentos.realizadosAntes(atual.getIdVeiculo(), atual.getRealizadoEm()).stream().findFirst().orElse(null);
        if (anterior == null) {
            return indisponivel("Este é o primeiro abastecimento realizado do veículo.", unidade);
        }
        boolean horas = unidade == UnidadeMedicao.HORAS;
        var rodado = rodado(principal(doVeiculo), anterior.getRealizadoEm(), atual.getRealizadoEm(), horas).orElse(null);
        if (rodado == null) {
            return new ConsumoAbastecimentoResponse(false, "Sem posições do rastreador nesse intervalo.", unidade,
                    anterior.getRealizadoEm(), null, null, null, null);
        }
        BigDecimal litros = litros(atual);
        Double consumo = null;
        if (litros.signum() > 0 && rodado > 0) {
            consumo = horas ? arredondar(litros.doubleValue() / rodado) : arredondar(rodado / litros.doubleValue());
        }
        return new ConsumoAbastecimentoResponse(true, null, unidade, anterior.getRealizadoEm(), arredondar(rodado),
                litros.signum() == 0 ? null : litros, consumo, null);
    }

    // ── Apoio ───────────────────────────────────────────────────────────────────────

    /** Rodado entre dois instantes pelo odômetro (ou horímetro) do rastreador. */
    Optional<Double> rodado(RastreadorTelemetria r, OffsetDateTime de, OffsetDateTime ate, boolean horas) {
        var inicio = posicoes.pontoEm(List.of(r.getId()), de, SincronizacaoTelemetriaUseCases.TOLERANCIA_PONTO, horas);
        var fim = posicoes.pontoEm(List.of(r.getId()), ate, SincronizacaoTelemetriaUseCases.TOLERANCIA_PONTO, horas);
        if (inicio.isEmpty() || fim.isEmpty() || !fim.get().lidoEm().isAfter(inicio.get().lidoEm())) {
            return Optional.empty();
        }
        double delta = horas ? fim.get().horimetroHoras() - inicio.get().horimetroHoras()
                : (fim.get().odometroMetros() - inicio.get().odometroMetros()) / 1000.0;
        return delta < 0 ? Optional.empty() : Optional.of(arredondar(delta));
    }

    private static RastreadorTelemetria principal(List<RastreadorTelemetria> doVeiculo) {
        return doVeiculo.stream().max(Comparator.comparing(RastreadorTelemetria::getUltimaComunicacao,
                Comparator.nullsFirst(Comparator.naturalOrder()))).orElseThrow();
    }

    private static BigDecimal litros(Abastecimento a) {
        return a.getItens().stream().filter(ItemAbastecimento::isCombustivelEntregue)
                .map(ItemAbastecimento::getQuantidade).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static ConsumoAbastecimentoResponse indisponivel(String motivo, UnidadeMedicao unidade) {
        return new ConsumoAbastecimentoResponse(false, motivo, unidade, null, null, null, null, null);
    }

    private static double arredondar(double v) {
        return BigDecimal.valueOf(v).setScale(1, RoundingMode.HALF_UP).doubleValue();
    }

    private RastreadorTelemetria buscarRastreador(UUID id) {
        return rastreadores.findById(id).filter(RastreadorTelemetria::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Rastreador não encontrado."));
    }

    private Collection<UUID> idsVeiculoPorBusca(String busca) {
        if (busca == null || busca.isBlank()) {
            return null;
        }
        String placa = RastreadorTelemetria.normalizarPlaca(busca);
        if (placa == null || placa.isEmpty()) {
            return List.of();
        }
        return fichas.findTop200ByPlacaContainingIgnoreCase(placa).stream().map(FichaVeiculo::getIdVeiculo).toList();
    }

    private Collection<UUID> idsVeiculoPorBase(List<UUID> idsBase) {
        if (idsBase == null || idsBase.isEmpty()) {
            return null;
        }
        return fichas.findAllByIdBaseOperacionalIn(idsBase).stream().map(FichaVeiculo::getIdVeiculo).toList();
    }

    private static Pageable ordenado(Pageable pageable, Sort padrao) {
        if (pageable == null) {
            return PageRequest.of(0, 25, padrao);
        }
        return pageable.getSort().isSorted() ? pageable : PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), padrao);
    }

    private Map<UUID, RastreadorResponse> montarRastreadores(List<RastreadorTelemetria> lista, OffsetDateTime agora) {
        Set<UUID> idsVeiculo = lista.stream().map(RastreadorTelemetria::getIdVeiculo).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, FichaVeiculo> porVeiculo = idsVeiculo.isEmpty() ? Map.of() : fichas.findAllByIdVeiculoIn(idsVeiculo).stream()
                .collect(Collectors.toMap(FichaVeiculo::getIdVeiculo, Function.identity(), (a, b) -> a));
        var bases = referencias.nomesBases(porVeiculo.values().stream().map(FichaVeiculo::getIdBaseOperacional)
                .filter(Objects::nonNull).collect(Collectors.toSet()));
        var nomes = referencias.nomesColaboradores(lista.stream().map(RastreadorTelemetria::getIdColaboradorMotorista)
                .filter(Objects::nonNull).collect(Collectors.toSet()));
        var limite = agora.minus(SEM_COMUNICACAO);
        return lista.stream().collect(Collectors.toMap(RastreadorTelemetria::getId, r -> {
            var ficha = r.getIdVeiculo() == null ? null : porVeiculo.get(r.getIdVeiculo());
            boolean semComunicacao = r.isVinculado() && (r.getUltimaComunicacao() == null || r.getUltimaComunicacao().isBefore(limite));
            return new RastreadorResponse(r.getId(), r.getProvedor(), r.getProvedor().getRotulo(), r.getIdExterno(),
                    r.getPlacaProvedor(), r.getNomeProvedor(), r.getSituacao(), r.getSituacao().getRotulo(), r.isVinculoManual(),
                    r.getIdVeiculo(), ficha == null ? null : ficha.getPlaca(),
                    ficha == null || ficha.getIdBaseOperacional() == null ? null : bases.get(ficha.getIdBaseOperacional()),
                    r.getUltimaComunicacao(), r.getLatitude(), r.getLongitude(), r.getVelocidadeKmh(), r.getIgnicao(),
                    r.getOdometroMetros() == null ? null : BigDecimal.valueOf(r.getOdometroMetros()).divide(BigDecimal.valueOf(1000), 1, RoundingMode.HALF_UP),
                    r.getHorimetroHoras(), r.getMotoristaNome(), r.getIdColaboradorMotorista(),
                    r.getIdColaboradorMotorista() == null ? null : nomes.get(r.getIdColaboradorMotorista()), semComunicacao);
        }, (a, b) -> a, java.util.LinkedHashMap::new));
    }

    private Map<UUID, EventoResponse> montarEventos(List<EventoTelemetria> lista) {
        Set<UUID> idsVeiculo = lista.stream().map(EventoTelemetria::getIdVeiculo).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, UUID> basePorVeiculo = new java.util.HashMap<>();
        if (!idsVeiculo.isEmpty()) {
            fichas.findAllByIdVeiculoIn(idsVeiculo).forEach(f -> {
                if (f.getIdBaseOperacional() != null) basePorVeiculo.put(f.getIdVeiculo(), f.getIdBaseOperacional());
            });
        }
        var bases = referencias.nomesBases(new HashSet<>(basePorVeiculo.values()));
        var nomes = referencias.nomesColaboradores(lista.stream().map(EventoTelemetria::getIdColaborador)
                .filter(Objects::nonNull).collect(Collectors.toSet()));
        return lista.stream().collect(Collectors.toMap(EventoTelemetria::getId, e -> {
            UUID idBase = e.getIdVeiculo() == null ? null : basePorVeiculo.get(e.getIdVeiculo());
            return new EventoResponse(e.getId(), e.getProvedor(), e.getProvedor().getRotulo(), e.getTipo(), e.getTipo().getRotulo(),
                    e.getOcorridoEm(), e.getIdVeiculo(), e.getPlaca(), idBase == null ? null : bases.get(idBase),
                    e.getLatitude(), e.getLongitude(), e.getEndereco(), e.getVelocidadeKmh(), e.getLimiteKmh(),
                    e.getDuracaoSegundos(), e.getDescricao(), e.detalhe(), e.getMotoristaNome(), e.getIdColaborador(),
                    e.getIdColaborador() == null ? null : nomes.get(e.getIdColaborador()), e.getOrigemCondutor(),
                    e.getOrigemCondutor() == null ? null : e.getOrigemCondutor().getRotulo());
        }, (a, b) -> a, java.util.LinkedHashMap::new));
    }
}
