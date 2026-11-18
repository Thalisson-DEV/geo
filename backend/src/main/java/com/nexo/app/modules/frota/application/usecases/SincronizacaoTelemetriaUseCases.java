package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.FrotaCondutorApi;
import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.TelemetriaFrotaProperties;
import com.nexo.app.modules.frota.application.events.MotoristaIdentificadoNaTelemetria;
import com.nexo.app.modules.frota.domain.EventoTelemetria;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.FonteTelemetria;
import com.nexo.app.modules.frota.domain.FonteTelemetria.FalhaTelemetria;
import com.nexo.app.modules.frota.domain.OrigemCondutorTelemetria;
import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import com.nexo.app.modules.frota.domain.RastreadorTelemetria;
import com.nexo.app.modules.frota.domain.RotinaTelemetria;
import com.nexo.app.modules.frota.domain.SincronizacaoTelemetria;
import com.nexo.app.modules.frota.domain.SituacaoRastreador;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;
import com.nexo.app.modules.frota.infrastructure.persistence.EventoTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PosicaoTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RastreadorTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SincronizacaoTelemetriaRepository;
import com.nexo.app.shared.domain.events.FrotaTelemetriaEventoEvent;
import com.nexo.app.shared.domain.events.FrotaTelemetriaFalhaEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Sincronização com os provedores de telemetria. Cada provedor roda separado (a falha de um não
 * para o outro) e cada rastreador ou evento grava na sua transação (um registro ruim não perde
 * os outros).
 *
 * <ul>
 *   <li><b>Veículos:</b> casa o rastreador pela placa, guarda o último estado e a posição e lança
 *   o km calibrado pelo painel no livro-razão.</li>
 *   <li><b>Eventos:</b> importa os eventos de condução sem duplicar e identifica o condutor.</li>
 * </ul>
 */
@Slf4j
@Service
public class SincronizacaoTelemetriaUseCases {

    static final Duration TOLERANCIA_PONTO = Duration.ofHours(48);
    private static final DateTimeFormatter DIA_HORA = DateTimeFormatter.ofPattern("dd/MM HH:mm");
    private static final String LINK = "/frota/telemetria";

    private final Map<ProvedorTelemetria, FonteTelemetria> fontes = new EnumMap<>(ProvedorTelemetria.class);
    private final RastreadorTelemetriaRepository rastreadores;
    private final EventoTelemetriaRepository eventos;
    private final SincronizacaoTelemetriaRepository sincronizacoes;
    private final PosicaoTelemetriaRepository posicoes;
    private final FichaVeiculoRepository fichas;
    private final OdometroUseCases odometro;
    private final FrotaCondutorApi condutorApi;
    private final CondutoresTelemetria condutores;
    private final ReferenciasFrota referencias;
    private final ApplicationEventPublisher eventPublisher;
    private final TelemetriaFrotaProperties properties;
    private final TransactionTemplate transacao;
    private final Map<RotinaTelemetria, ReentrantLock> travas = new EnumMap<>(RotinaTelemetria.class);

    public SincronizacaoTelemetriaUseCases(List<FonteTelemetria> fontes, RastreadorTelemetriaRepository rastreadores,
                                           EventoTelemetriaRepository eventos, SincronizacaoTelemetriaRepository sincronizacoes,
                                           PosicaoTelemetriaRepository posicoes, FichaVeiculoRepository fichas,
                                           OdometroUseCases odometro, FrotaCondutorApi condutorApi,
                                           CondutoresTelemetria condutores, ReferenciasFrota referencias,
                                           ApplicationEventPublisher eventPublisher, TelemetriaFrotaProperties properties,
                                           PlatformTransactionManager transactionManager) {
        fontes.forEach(f -> this.fontes.put(f.provedor(), f));
        this.rastreadores = rastreadores;
        this.eventos = eventos;
        this.sincronizacoes = sincronizacoes;
        this.posicoes = posicoes;
        this.fichas = fichas;
        this.odometro = odometro;
        this.condutorApi = condutorApi;
        this.condutores = condutores;
        this.referencias = referencias;
        this.eventPublisher = eventPublisher;
        this.properties = properties;
        this.transacao = new TransactionTemplate(transactionManager);
        for (RotinaTelemetria rotina : RotinaTelemetria.values()) {
            travas.put(rotina, new ReentrantLock());
        }
    }

    /** Se o provedor tem chave configurada. */
    public boolean configurado(ProvedorTelemetria provedor) {
        var fonte = fontes.get(provedor);
        return fonte != null && fonte.configurada();
    }

    /** @return se rodou (falso quando outra rodada da mesma rotina ainda está em andamento) */
    public boolean sincronizarVeiculos() {
        return comTrava(RotinaTelemetria.VEICULOS, () -> fontes.values().forEach(this::sincronizarVeiculos));
    }

    /** @return se rodou (falso quando outra rodada da mesma rotina ainda está em andamento) */
    public boolean sincronizarEventos() {
        return comTrava(RotinaTelemetria.EVENTOS, () -> fontes.values().forEach(this::sincronizarEventos));
    }

    /** Retenção das posições (LGPD). */
    public int limparPosicoes() {
        return posicoes.apagarAntesDe(OffsetDateTime.now().minusDays(properties.getRetencaoPosicoesDias()));
    }

    // ── Veículos ────────────────────────────────────────────────────────────────────

    void sincronizarVeiculos(FonteTelemetria fonte) {
        var agora = OffsetDateTime.now();
        if (!fonte.configurada()) {
            atualizarSituacao(fonte.provedor(), RotinaTelemetria.VEICULOS, s -> s.registrarSemConfiguracao(agora));
            return;
        }
        List<FonteTelemetria.VeiculoProvedor> lidos;
        try {
            lidos = fonte.veiculos();
        } catch (RuntimeException e) {
            registrarFalha(fonte.provedor(), RotinaTelemetria.VEICULOS, agora, e);
            return;
        }
        var porPlaca = referencias.idsVeiculosPorPlaca();
        Map<String, UUID> porIdRastreador = fichas.findAllByProvedorTelemetria(fonte.provedor()).stream()
                .filter(f -> f.getIdRastreador() != null)
                .collect(Collectors.toMap(FichaVeiculo::getIdRastreador, FichaVeiculo::getIdVeiculo, (a, b) -> a));
        Map<String, UUID> existentes = rastreadores.findAllByProvedorAndAtivoTrue(fonte.provedor()).stream()
                .collect(Collectors.toMap(RastreadorTelemetria::getIdExterno, RastreadorTelemetria::getId));
        var rodada = condutores.novaRodada();
        int falhas = 0;
        for (var lido : lidos) {
            try {
                transacao.executeWithoutResult(t -> processarVeiculo(fonte.provedor(), lido, existentes.get(lido.idExterno()),
                        porIdRastreador, porPlaca, rodada, agora));
            } catch (RuntimeException e) {
                falhas++;
                log.warn("Telemetria {}: não foi possível gravar o rastreador {}: {}", fonte.provedor(), lido.idExterno(), e.getMessage());
            }
        }
        int processados = lidos.size() - falhas;
        atualizarSituacao(fonte.provedor(), RotinaTelemetria.VEICULOS, s -> s.registrarSucesso(agora, processados));
    }

    private void processarVeiculo(ProvedorTelemetria provedor, FonteTelemetria.VeiculoProvedor lido, UUID idExistente,
                                  Map<String, UUID> porIdRastreador, Map<String, UUID> porPlaca,
                                  CondutoresTelemetria.Rodada rodada, OffsetDateTime agora) {
        RastreadorTelemetria r = idExistente == null ? new RastreadorTelemetria(provedor, lido.idExterno())
                : rastreadores.findById(idExistente).orElseThrow();
        r.atualizarCadastro(lido.placa(), lido.nome());
        UUID idVeiculo = porIdRastreador.get(lido.idExterno());
        if (idVeiculo == null) {
            idVeiculo = porPlaca.get(RastreadorTelemetria.normalizarPlaca(lido.placa()));
        }
        r.vincularAutomaticamente(idVeiculo);
        var motorista = lido.leitura() == null ? null : lido.leitura().motorista();
        Boolean ignicaoAnterior = r.getIgnicao();
        UUID motoristaAnterior = r.getIdColaboradorMotorista();
        boolean nova = r.registrarLeitura(lido.leitura(), rodada.colaborador(motorista).orElse(null));
        boolean gravarPosicao = nova && r.deveGravarPosicao(lido.leitura(), ignicaoAnterior, properties.getIntervaloPosicaoParado());
        if (gravarPosicao) {
            r.marcarPosicaoGravada(lido.leitura().lidoEm());
        }
        // Flush: a posição vai por JDBC e referencia o rastreador, que precisa já estar no banco.
        r = rastreadores.saveAndFlush(r);
        if (r.isVinculado()) {
            UUID id = r.getIdVeiculo();
            final var rastreador = r;
            fichas.findByIdVeiculo(id).ifPresent(f -> {
                if (f.associarRastreador(provedor, rastreador.getIdExterno())) {
                    fichas.save(f);
                }
            });
        }
        if (gravarPosicao) {
            posicoes.inserir(r.getId(), lido.leitura());
        }
        if (nova) {
            if (r.isVinculado()) {
                registrarKm(r, agora);
                // Outro motorista no cartão do rastreador: ele passa a ser o condutor do veículo.
                if (r.getIdColaboradorMotorista() != null && !r.getIdColaboradorMotorista().equals(motoristaAnterior)) {
                    eventPublisher.publishEvent(new MotoristaIdentificadoNaTelemetria(r.getIdVeiculo(),
                            r.getIdColaboradorMotorista(), lido.leitura().lidoEm(), r.getId()));
                }
            }
        }
    }

    /**
     * Km da telemetria no livro-razão: a última leitura de painel mais o que o rastreador rodou
     * desde ela. Só grava quando avança o km atual, no máximo a cada intervalo configurado.
     */
    void registrarKm(RastreadorTelemetria r, OffsetDateTime agora) {
        if (!properties.isRegistrarKm() || !r.podeRegistrarLeitura(agora, properties.getIntervaloLeitura())) {
            return;
        }
        var ficha = fichas.findByIdVeiculo(r.getIdVeiculo()).orElse(null);
        if (ficha == null || !ficha.isAtivo() || !principal(r)) {
            return;
        }
        boolean horas = ficha.getUnidadeMedicao() == UnidadeMedicao.HORAS;
        var estimativa = estimar(r, horas);
        if (estimativa.isEmpty()) {
            return;
        }
        var atual = odometro.medicaoAtual(r.getIdVeiculo());
        if (atual.isPresent() && estimativa.get() <= atual.get().valor()) {
            return;
        }
        UUID idOrigem = UUID.nameUUIDFromBytes(("TEL:" + r.getId() + ":" + r.getUltimaComunicacao().toInstant())
                .getBytes(StandardCharsets.UTF_8));
        odometro.registrarLeitura(r.getIdVeiculo(), estimativa.get(), r.getUltimaComunicacao(),
                FrotaOdometroApi.OrigemLeitura.TELEMETRIA, idOrigem, null);
        r.marcarLeituraRegistrada(agora);
        rastreadores.save(r);
    }

    /** Âncora de painel + o que o rastreador rodou desde ela; vazio sem âncora ou sem a posição da âncora. */
    Optional<Long> estimar(RastreadorTelemetria r, boolean horas) {
        Double agoraValor = horas ? (r.getHorimetroHoras() == null ? null : r.getHorimetroHoras().doubleValue())
                : (r.getOdometroMetros() == null ? null : r.getOdometroMetros().doubleValue());
        if (agoraValor == null) {
            return Optional.empty();
        }
        var ancora = odometro.ultimaLeituraPainel(r.getIdVeiculo()).orElse(null);
        if (ancora == null || (ancora.getUnidade() == UnidadeMedicao.HORAS) != horas) {
            return Optional.empty();
        }
        var ponto = posicoes.pontoEm(List.of(r.getId()), ancora.getLidoEm(), TOLERANCIA_PONTO, horas).orElse(null);
        if (ponto == null) {
            return Optional.empty();
        }
        double naAncora = horas ? ponto.horimetroHoras() : ponto.odometroMetros();
        double rodado = horas ? agoraValor - naAncora : (agoraValor - naAncora) / 1000.0;
        if (rodado < 0) {
            // O rastreador zerou ou foi trocado: espera a próxima leitura de painel recalibrar.
            return Optional.empty();
        }
        return Optional.of(ancora.getKm() + (long) Math.floor(rodado));
    }

    /** Com dois rastreadores no mesmo veículo, a posição e o km vêm do que comunicou por último. */
    private boolean principal(RastreadorTelemetria r) {
        return rastreadores.findAllByIdVeiculoAndAtivoTrueOrderByUltimaComunicacaoDesc(r.getIdVeiculo()).stream()
                .filter(RastreadorTelemetria::isVinculado)
                .filter(o -> o.getUltimaComunicacao() != null)
                .max(Comparator.comparing(RastreadorTelemetria::getUltimaComunicacao))
                .map(o -> o.getId().equals(r.getId())).orElse(true);
    }

    // ── Eventos ─────────────────────────────────────────────────────────────────────

    void sincronizarEventos(FonteTelemetria fonte) {
        var agora = OffsetDateTime.now();
        if (!fonte.configurada()) {
            atualizarSituacao(fonte.provedor(), RotinaTelemetria.EVENTOS, s -> s.registrarSemConfiguracao(agora));
            return;
        }
        var vinculados = rastreadores.findAllByProvedorAndSituacaoAndAtivoTrue(fonte.provedor(), SituacaoRastreador.VINCULADO);
        Map<String, RastreadorTelemetria> porExterno = vinculados.stream()
                .collect(Collectors.toMap(RastreadorTelemetria::getIdExterno, Function.identity()));
        var desde = new HashMap<String, OffsetDateTime>();
        vinculados.forEach(r -> desde.put(r.getIdExterno(),
                r.getEventosAte() != null ? r.getEventosAte() : agora.minus(properties.getJanelaInicialEventos())));
        FonteTelemetria.EventosLidos lidos;
        try {
            lidos = fonte.eventos(desde, agora);
        } catch (RuntimeException e) {
            registrarFalha(fonte.provedor(), RotinaTelemetria.EVENTOS, agora, e);
            return;
        }
        var conhecidos = lidos.eventos().stream().filter(e -> porExterno.containsKey(e.idExternoVeiculo())).toList();
        var jaImportados = new HashSet<String>();
        var ids = conhecidos.stream().map(FonteTelemetria.EventoProvedor::idExterno).distinct().toList();
        for (int i = 0; i < ids.size(); i += 1000) {
            jaImportados.addAll(eventos.idsExternosExistentes(fonte.provedor(), ids.subList(i, Math.min(ids.size(), i + 1000))));
        }
        var rodada = condutores.novaRodada();
        var placas = placasDaFrota(vinculados);
        int novos = 0;
        for (var evento : conhecidos) {
            if (!jaImportados.add(evento.idExterno())) {
                continue;
            }
            var rastreador = porExterno.get(evento.idExternoVeiculo());
            try {
                Boolean gravou = transacao.execute(t -> importar(rastreador, placas.get(rastreador.getIdVeiculo()), evento, rodada));
                if (Boolean.TRUE.equals(gravou)) {
                    novos++;
                }
            } catch (DataIntegrityViolationException e) {
                // Outra rodada importou o mesmo evento ao mesmo tempo: nada a fazer.
            } catch (RuntimeException e) {
                log.warn("Telemetria {}: evento {} não importado: {}", fonte.provedor(), evento.idExterno(), e.getMessage());
            }
        }
        transacao.executeWithoutResult(t -> lidos.lidosAte().forEach((idExterno, ate) -> {
            var r = porExterno.get(idExterno);
            if (r != null && ate != null) {
                rastreadores.findById(r.getId()).ifPresent(atual -> {
                    atual.avancarEventos(ate);
                    rastreadores.save(atual);
                });
            }
        }));
        int importados = novos;
        atualizarSituacao(fonte.provedor(), RotinaTelemetria.EVENTOS, s -> s.registrarSucesso(agora, importados));
    }

    private boolean importar(RastreadorTelemetria rastreador, String placa, FonteTelemetria.EventoProvedor evento,
                             CondutoresTelemetria.Rodada rodada) {
        UUID colaborador = rodada.colaborador(evento.motorista()).orElse(null);
        OrigemCondutorTelemetria origem = colaborador == null ? null : OrigemCondutorTelemetria.PROVEDOR;
        if (colaborador == null && rastreador.getIdVeiculo() != null) {
            colaborador = condutorApi.condutorEm(rastreador.getIdVeiculo(), evento.ocorridoEm()).orElse(null);
            origem = colaborador == null ? null : OrigemCondutorTelemetria.VINCULO;
        }
        var salvo = eventos.save(new EventoTelemetria(rastreador, placa, evento, colaborador, origem));
        publicar(salvo);
        return true;
    }

    private void publicar(EventoTelemetria e) {
        String condutor = e.getIdColaborador() == null ? "condutor não identificado"
                : referencias.nomesColaboradores(List.of(e.getIdColaborador())).getOrDefault(e.getIdColaborador(), "condutor");
        String base = e.getIdVeiculo() == null ? null : fichas.findByIdVeiculo(e.getIdVeiculo())
                .map(FichaVeiculo::getIdBaseOperacional).filter(Objects::nonNull)
                .map(id -> referencias.nomesBases(List.of(id)).get(id)).orElse(null);
        eventPublisher.publishEvent(new FrotaTelemetriaEventoEvent(e.getId(), e.getTipo().getRotulo(), e.getTipo().name(),
                e.getPlaca(), e.getOcorridoEm().atZoneSameInstant(LiberacaoCnhUseCases.FUSO).format(DIA_HORA), condutor,
                e.detalhe(), base, LINK + "/eventos?evento=" + e.getId()));
    }

    private Map<UUID, String> placasDaFrota(List<RastreadorTelemetria> vinculados) {
        var ids = vinculados.stream().map(RastreadorTelemetria::getIdVeiculo).filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Map.of();
        }
        return fichas.findAllByIdVeiculoIn(ids).stream()
                .collect(Collectors.toMap(FichaVeiculo::getIdVeiculo, FichaVeiculo::getPlaca, (a, b) -> a));
    }

    // ── Situação ────────────────────────────────────────────────────────────────────

    private void registrarFalha(ProvedorTelemetria provedor, RotinaTelemetria rotina, OffsetDateTime agora, RuntimeException e) {
        String mensagem = e instanceof FalhaTelemetria ? e.getMessage() : "Erro inesperado: " + e.getMessage();
        log.warn("Telemetria {} ({}): {}", provedor, rotina, mensagem);
        atualizarSituacao(provedor, rotina, s -> {
            s.registrarFalha(agora, mensagem);
            if (s.precisaAvisarFalha(agora, properties.getToleranciaFalha())) {
                String desde = s.getUltimoSucesso() == null ? "a ativação"
                        : s.getUltimoSucesso().atZoneSameInstant(LiberacaoCnhUseCases.FUSO).format(DIA_HORA);
                eventPublisher.publishEvent(new FrotaTelemetriaFalhaEvent(s.getId(), provedor.getRotulo(), desde, mensagem, LINK));
                s.marcarFalhaAvisada(agora);
            }
        });
    }

    private void atualizarSituacao(ProvedorTelemetria provedor, RotinaTelemetria rotina,
                                   java.util.function.Consumer<SincronizacaoTelemetria> mudanca) {
        transacao.executeWithoutResult(t -> {
            var s = sincronizacoes.findByProvedorAndRotina(provedor, rotina)
                    .orElseGet(() -> sincronizacoes.saveAndFlush(new SincronizacaoTelemetria(provedor, rotina)));
            mudanca.accept(s);
            sincronizacoes.save(s);
        });
    }

    private boolean comTrava(RotinaTelemetria rotina, Runnable rodada) {
        var trava = travas.get(rotina);
        if (!trava.tryLock()) {
            return false;
        }
        try {
            rodada.run();
            return true;
        } finally {
            trava.unlock();
        }
    }
}
