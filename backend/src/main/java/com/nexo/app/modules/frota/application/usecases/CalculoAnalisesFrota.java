package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.execucao.TurnoVeiculoApi;
import com.nexo.app.modules.execucao.TurnoVeiculoApi.NotaGeorreferenciada;
import com.nexo.app.modules.execucao.TurnoVeiculoApi.TurnoDoVeiculo;
import com.nexo.app.modules.frota.application.TelemetriaFrotaProperties;
import com.nexo.app.modules.frota.application.usecases.ReferenciasFrota.EquipeComBase;
import com.nexo.app.modules.frota.domain.AnaliseAbastecimento;
import com.nexo.app.modules.frota.domain.AnaliseTrajeto;
import com.nexo.app.modules.frota.domain.AnaliseTrajeto.Parada;
import com.nexo.app.modules.frota.domain.AnaliseTrajeto.Ponto;
import com.nexo.app.modules.frota.domain.EtapaAlertaAbastecimento;
import com.nexo.app.modules.frota.domain.Expediente;
import com.nexo.app.modules.frota.domain.RastreadorTelemetria;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimentoGeo;
import com.nexo.app.modules.frota.domain.SituacaoNotaGeo;
import com.nexo.app.modules.frota.domain.TipoAlertaAbastecimento;
import com.nexo.app.modules.frota.domain.TipoParadaTurno;
import com.nexo.app.modules.frota.infrastructure.persistence.AbastecimentoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository.AbastecimentoAnalisado;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository.AbastecimentoRealizado;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository.NotaTurno;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository.PostoLocalizado;
import com.nexo.app.modules.frota.infrastructure.persistence.PosicaoTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RastreadorTelemetriaRepository;
import com.nexo.app.modules.rh.BaseOperacionalResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Calcula os resumos das análises da telemetria a partir da série de posições: o dia de cada
 * veículo, cada turno com veículo (trajeto, paradas e notas) e cada abastecimento (onde o veículo
 * estava), além do lugar de cada posto, aprendido pelos próprios abastecimentos.
 *
 * <p>O cálculo de um turno serve à gravação (job) e à tela de detalhe, que recalcula na hora: o
 * turno aberto aparece ao vivo e o fechado reflete as notas que chegaram depois.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CalculoAnalisesFrota {

    /** Distância máxima no tempo entre o instante e a posição usada para situá-lo. */
    static final Duration TOLERANCIA_POSICAO = Duration.ofMinutes(15);
    /** Base sem raio cadastrado: o veículo está "na base" a até esta distância das coordenadas. */
    static final int RAIO_BASE_PADRAO_METROS = 300;
    /** Amostras paradas necessárias para o C.E.S confiar no lugar aprendido de um posto. */
    static final int AMOSTRAS_MINIMAS_POSTO = 3;
    /**
     * Nota lançada a mais que isto do veículo do turno, no mesmo instante, é nota fora do local. A
     * equipe estaciona e anda até o cliente: 500 m cobrem a quadra sem esconder a nota de outro bairro.
     */
    static final int RAIO_NOTA_METROS = 500;
    /** Abastecimento com o veículo a mais que isto do lugar aprendido do posto é abastecimento longe do posto. */
    static final int RAIO_POSTO_METROS = 500;
    /** Amostra a mais que isto do primeiro centro não entra no lugar do posto (abastecimento fora, GPS ruim). */
    private static final double DESCARTE_AMOSTRA_METROS = 2_000;
    private static final int MAXIMO_PONTOS = 5_000;

    private final RastreadorTelemetriaRepository rastreadores;
    private final PosicaoTelemetriaRepository posicoes;
    private final AnaliseTelemetriaRepository analises;
    private final ReferenciasFrota referencias;
    private final TurnoVeiculoApi turnoApi;
    private final TelemetriaFrotaProperties properties;
    private final AbastecimentoRepository abastecimentos;
    private final TransactionTemplate transacao;

    // ── Dia ──────────────────────────────────────────────────────────────────────

    /** Recalcula o dia do veículo; sem posição no dia, nada é gravado. */
    public void calcularDia(UUID idVeiculo, LocalDate dia, Expediente expediente) {
        OffsetDateTime de = dia.atStartOfDay(Expediente.FUSO).toOffsetDateTime();
        OffsetDateTime ate = dia.plusDays(1).atStartOfDay(Expediente.FUSO).toOffsetDateTime();
        UUID principal = analises.rastreadorPrincipal(idsRastreadores(idVeiculo), de, ate);
        if (principal == null) return;
        var pontos = pontos(principal, de, ate);
        var resumo = AnaliseTrajeto.resumir(AnaliseTrajeto.trechos(pontos), expediente::dentro);
        analises.gravarDia(new AnaliseTelemetriaRepository.Dia(idVeiculo, dia, principal, resumo.km(),
                minutos(resumo.minutosMovimento()), minutos(resumo.minutosLigadoParado()), resumo.kmForaExpediente(),
                minutos(resumo.minutosForaExpediente()), resumo.primeiraPartida(), resumo.ultimaParada(), pontos.size()));
    }

    // ── Turno ────────────────────────────────────────────────────────────────────

    /** Parada do turno, já classificada. */
    record ParadaTurno(Parada parada, TipoParadaTurno tipo) {
    }

    /** Turno calculado: o resumo gravável, as notas situadas, o trajeto e as paradas (para o mapa). */
    record TurnoCalculado(AnaliseTelemetriaRepository.Turno resumo, List<NotaTurno> notas, List<Ponto> trajeto,
                          List<ParadaTurno> paradas, BaseOperacionalResponse base, int raioBaseMetros,
                          Map<UUID, String> referencias) {
    }

    /** Calcula o turno pelas posições gravadas; aberto, vai até agora. */
    TurnoCalculado calcularTurno(TurnoDoVeiculo turno, List<NotaGeorreferenciada> notas, EquipeComBase equipe,
                                 OffsetDateTime agora) {
        return calcularTurno(turno, notas, equipe, agora, null);
    }

    /**
     * Calcula o turno; com {@code doProvedor} (o histórico denso do provedor no período), ele no
     * lugar das posições gravadas: km e paradas pela série espaçada, a nota pela posição mais exata.
     */
    TurnoCalculado calcularTurno(TurnoDoVeiculo turno, List<NotaGeorreferenciada> notas, EquipeComBase equipe,
                                 OffsetDateTime agora, List<Ponto> doProvedor) {
        OffsetDateTime fim = fimDoTurno(turno, agora);
        List<Ponto> pontos;
        List<Ponto> serie;
        if (doProvedor != null) {
            pontos = doProvedor;
            serie = AnaliseTrajeto.espacarLeituraDensa(doProvedor);
        } else {
            UUID principal = analises.rastreadorPrincipal(idsRastreadores(turno.idVeiculo()), turno.inicio(), fim);
            pontos = principal == null ? List.of() : pontos(principal, turno.inicio(), fim);
            serie = pontos;
        }
        var trechos = AnaliseTrajeto.trechos(serie);
        var resumo = AnaliseTrajeto.resumir(trechos, instante -> true);

        BaseOperacionalResponse base = equipe == null ? null : equipe.base();
        boolean baseNoMapa = base != null && base.latitude() != null && base.longitude() != null;
        int raioBase = base != null && base.raio() != null && base.raio() > 0 ? base.raio() : RAIO_BASE_PADRAO_METROS;
        int raioNota = RAIO_NOTA_METROS;

        var paradas = new ArrayList<ParadaTurno>();
        double servico = 0, naBase = 0, semServico = 0;
        for (Parada parada : AnaliseTrajeto.paradas(trechos)) {
            TipoParadaTurno tipo;
            if (baseNoMapa && AnaliseTrajeto.distanciaMetros(parada.latitude(), parada.longitude(), base.latitude(), base.longitude()) <= raioBase) {
                tipo = TipoParadaTurno.BASE;
                naBase += parada.minutos();
            } else if (notas.stream().anyMatch(n -> n.latitude() != null && n.longitude() != null
                    && AnaliseTrajeto.distanciaMetros(parada.latitude(), parada.longitude(), n.latitude(), n.longitude()) <= raioNota)) {
                tipo = TipoParadaTurno.SERVICO;
                servico += parada.minutos();
            } else {
                tipo = TipoParadaTurno.SEM_SERVICO;
                semServico += parada.minutos();
            }
            paradas.add(new ParadaTurno(parada, tipo));
        }

        OffsetDateTime saida = null;
        OffsetDateTime chegada = null;
        if (baseNoMapa) {
            OffsetDateTime ultimaFora = null;
            for (Ponto ponto : pontos) {
                boolean fora = AnaliseTrajeto.distanciaMetros(ponto.latitude(), ponto.longitude(), base.latitude(), base.longitude()) > raioBase;
                if (fora) {
                    if (saida == null) saida = ponto.em();
                    ultimaFora = ponto.em();
                    chegada = null;
                } else if (ultimaFora != null && chegada == null) {
                    chegada = ponto.em();
                }
            }
        }

        var notasTurno = new ArrayList<NotaTurno>();
        int noLocal = 0, foraLocal = 0, semDado = 0;
        BigDecimal valor = BigDecimal.ZERO;
        var refs = new HashMap<UUID, String>();
        for (NotaGeorreferenciada n : notas) {
            refs.put(n.idExecucao(), n.referenciaNota());
            if (n.concluida() && n.valor() != null) valor = valor.add(n.valor());
            SituacaoNotaGeo situacao;
            Integer distancia = null;
            Double latVeiculo = null, lngVeiculo = null;
            if (n.latitude() == null || n.longitude() == null) {
                situacao = SituacaoNotaGeo.SEM_COORDENADA_NOTA;
            } else {
                var posicao = AnaliseTrajeto.posicaoEm(pontos, n.dataLancamento(), TOLERANCIA_POSICAO).orElse(null);
                if (posicao == null) {
                    situacao = SituacaoNotaGeo.SEM_POSICAO_VEICULO;
                } else {
                    latVeiculo = posicao.latitude();
                    lngVeiculo = posicao.longitude();
                    distancia = (int) Math.round(AnaliseTrajeto.distanciaMetros(n.latitude(), n.longitude(), latVeiculo, lngVeiculo));
                    situacao = distancia > raioNota ? SituacaoNotaGeo.FORA_DO_LOCAL : SituacaoNotaGeo.NO_LOCAL;
                }
            }
            switch (situacao) {
                case NO_LOCAL -> noLocal++;
                case FORA_DO_LOCAL -> foraLocal++;
                default -> semDado++;
            }
            notasTurno.add(new NotaTurno(n.idExecucao(), turno.idTurno(), n.dataLancamento(), situacao.name(), distancia,
                    n.latitude(), n.longitude(), latVeiculo, lngVeiculo, n.valor()));
        }

        var linha = new AnaliseTelemetriaRepository.Turno(turno.idTurno(), turno.idVeiculo(), turno.idEquipe(),
                base == null ? null : base.id(), turno.inicio(), fim, pontos.size() >= 2, resumo.km(),
                minutos(resumo.minutosMovimento()), minutos(servico), minutos(naBase), minutos(semServico),
                minutos(resumo.minutosLigadoParado()), saida, chegada, notas.size(), valor, noLocal, foraLocal, semDado);
        return new TurnoCalculado(linha, notasTurno, pontos, paradas, baseNoMapa ? base : null, raioBase, refs);
    }

    static OffsetDateTime fimDoTurno(TurnoDoVeiculo turno, OffsetDateTime agora) {
        return turno.fim() != null ? turno.fim() : agora;
    }

    /** Calcula e grava os turnos informados (já fechados), com as notas e a base de cada equipe. */
    int gravarTurnos(List<TurnoDoVeiculo> turnos) {
        if (turnos.isEmpty()) return 0;
        var equipes = referencias.equipesComBase(turnos.stream().map(TurnoDoVeiculo::idEquipe).collect(Collectors.toSet()));
        var notas = turnoApi.listarNotas(turnos.stream().map(TurnoDoVeiculo::idTurno).toList()).stream()
                .collect(Collectors.groupingBy(NotaGeorreferenciada::idTurno));
        var agora = OffsetDateTime.now();
        for (TurnoDoVeiculo t : turnos) {
            var calculado = calcularTurno(t, notas.getOrDefault(t.idTurno(), List.of()), equipes.get(t.idEquipe()), agora);
            analises.gravarTurno(calculado.resumo(), calculado.notas());
        }
        return turnos.size();
    }

    // ── Abastecimento e postos ──────────────────────────────────────────────────

    /** Situa cada abastecimento (onde o veículo estava no instante) e grava; a distância ao posto vem depois. */
    int analisarAbastecimentos(List<AbastecimentoRealizado> realizados) {
        if (realizados.isEmpty()) return 0;
        var porVeiculo = rastreadores.findAllByIdVeiculoInAndAtivoTrue(
                        realizados.stream().map(AbastecimentoRealizado::idVeiculo).collect(Collectors.toSet())).stream()
                .collect(Collectors.groupingBy(RastreadorTelemetria::getIdVeiculo,
                        Collectors.mapping(RastreadorTelemetria::getId, Collectors.toList())));
        var lista = new ArrayList<AbastecimentoAnalisado>();
        for (AbastecimentoRealizado a : realizados) {
            var ids = porVeiculo.getOrDefault(a.idVeiculo(), List.of());
            OffsetDateTime de = a.realizadoEm().minus(TOLERANCIA_POSICAO);
            OffsetDateTime ate = a.realizadoEm().plus(TOLERANCIA_POSICAO);
            UUID principal = analises.rastreadorPrincipal(ids, de, ate);
            var posicao = principal == null ? null
                    : AnaliseTrajeto.posicaoEm(pontos(principal, de, ate), a.realizadoEm(), TOLERANCIA_POSICAO).orElse(null);
            lista.add(new AbastecimentoAnalisado(a.id(), a.idVeiculo(), a.idPosto(), a.realizadoEm(),
                    (posicao == null ? SituacaoAbastecimentoGeo.SEM_POSICAO : SituacaoAbastecimentoGeo.POSTO_SEM_REFERENCIA).name(),
                    posicao == null ? null : posicao.latitude(), posicao == null ? null : posicao.longitude(),
                    posicao == null ? null : posicao.velocidadeKmh(), null));
        }
        analises.gravarAbastecimentos(lista);
        return lista.size();
    }

    /**
     * Aprende o lugar de cada posto pelas posições do veículo parado nos abastecimentos (mediana,
     * descartando o que fica longe) e reclassifica todos os abastecimentos situados pela distância.
     * Quem passa a ficar (ou deixa de ficar) longe do posto ganha (ou perde) o alerta no próprio
     * abastecimento, onde o gestor já confere os demais.
     */
    void aprenderPostos() {
        OffsetDateTime desde = OffsetDateTime.now().minusDays(properties.getRetencaoPosicoesDias());
        var amostras = analises.listarAbastecimentosComPosicao(desde);
        var postos = new ArrayList<PostoLocalizado>();
        Map<UUID, PostoLocalizado> porId = new HashMap<>();
        amostras.stream().filter(a -> a.idPosto() != null)
                .filter(a -> a.velocidadeKmh() == null || a.velocidadeKmh() <= RastreadorTelemetria.VELOCIDADE_MOVIMENTO_KMH)
                .collect(Collectors.groupingBy(AbastecimentoAnalisado::idPosto))
                .forEach((idPosto, lista) -> localizarPosto(idPosto, lista).ifPresent(p -> {
                    postos.add(p);
                    porId.put(idPosto, p);
                }));
        analises.substituirPostos(postos);
        var reclassificados = amostras.stream().map(a -> {
            var posto = a.idPosto() == null ? null : porId.get(a.idPosto());
            if (posto == null) {
                return new AbastecimentoAnalisado(a.idAbastecimento(), a.idVeiculo(), a.idPosto(), a.realizadoEm(),
                        SituacaoAbastecimentoGeo.POSTO_SEM_REFERENCIA.name(), a.latitude(), a.longitude(), a.velocidadeKmh(), null);
            }
            int distancia = (int) Math.round(AnaliseTrajeto.distanciaMetros(a.latitude(), a.longitude(), posto.latitude(), posto.longitude()));
            var situacao = distancia > RAIO_POSTO_METROS ? SituacaoAbastecimentoGeo.LONGE_DO_POSTO : SituacaoAbastecimentoGeo.NO_POSTO;
            return new AbastecimentoAnalisado(a.idAbastecimento(), a.idVeiculo(), a.idPosto(), a.realizadoEm(), situacao.name(),
                    a.latitude(), a.longitude(), a.velocidadeKmh(), distancia);
        }).toList();
        analises.gravarAbastecimentos(reclassificados);
        var anteriores = amostras.stream().collect(Collectors.toMap(AbastecimentoAnalisado::idAbastecimento, AbastecimentoAnalisado::situacao));
        var mudaram = reclassificados.stream()
                .filter(a -> longe(a.situacao()) != longe(anteriores.get(a.idAbastecimento())))
                .collect(Collectors.toMap(AbastecimentoAnalisado::idAbastecimento, a -> a));
        if (!mudaram.isEmpty()) {
            transacao.executeWithoutResult(t -> abastecimentos.findAllById(mudaram.keySet()).forEach(ab -> {
                var a = mudaram.get(ab.getId());
                ab.registrarAlertas(EtapaAlertaAbastecimento.TELEMETRIA, longe(a.situacao())
                        ? List.of(new AnaliseAbastecimento.Alerta(TipoAlertaAbastecimento.LONGE_DO_POSTO, mensagemLonge(a.distanciaPostoMetros())))
                        : List.of());
                abastecimentos.save(ab);
            }));
        }
    }

    private static boolean longe(String situacao) {
        return SituacaoAbastecimentoGeo.LONGE_DO_POSTO.name().equals(situacao);
    }

    static String mensagemLonge(Integer metros) {
        String distancia = metros == null ? "longe" : metros < 1000 ? "a " + metros + " m"
                : "a " + String.format(java.util.Locale.forLanguageTag("pt-BR"), "%.1f", metros / 1000.0) + " km";
        return "No horário do abastecimento, o rastreador mostra o veículo " + distancia
                + " do lugar onde ele costuma abastecer neste posto. Confira o cupom e o horário.";
    }

    static java.util.Optional<PostoLocalizado> localizarPosto(UUID idPosto, List<AbastecimentoAnalisado> amostras) {
        var posicoesPosto = amostras.stream().map(a -> new double[]{a.latitude(), a.longitude()}).toList();
        if (posicoesPosto.size() < AMOSTRAS_MINIMAS_POSTO) return java.util.Optional.empty();
        double[] primeiro = AnaliseTrajeto.centro(posicoesPosto).orElseThrow();
        var perto = posicoesPosto.stream()
                .filter(p -> AnaliseTrajeto.distanciaMetros(p[0], p[1], primeiro[0], primeiro[1]) <= DESCARTE_AMOSTRA_METROS).toList();
        if (perto.size() < AMOSTRAS_MINIMAS_POSTO) return java.util.Optional.empty();
        double[] centro = AnaliseTrajeto.centro(perto).orElseThrow();
        double dispersao = AnaliseTrajeto.mediana(perto.stream()
                .map(p -> AnaliseTrajeto.distanciaMetros(p[0], p[1], centro[0], centro[1])).toList());
        return java.util.Optional.of(new PostoLocalizado(idPosto, centro[0], centro[1], perto.size(), (int) Math.round(dispersao)));
    }

    // ── Apoio ────────────────────────────────────────────────────────────────────

    List<UUID> idsRastreadores(UUID idVeiculo) {
        return rastreadores.findAllByIdVeiculoAndAtivoTrueOrderByUltimaComunicacaoDesc(idVeiculo).stream()
                .map(RastreadorTelemetria::getId).toList();
    }

    /** Série de um rastreador no intervalo, já no formato do domínio. */
    List<Ponto> pontos(UUID idRastreador, OffsetDateTime de, OffsetDateTime ate) {
        return posicoes.trajeto(List.of(idRastreador), de, ate, MAXIMO_PONTOS).stream()
                .map(p -> new Ponto(p.lidoEm(), p.latitude(), p.longitude(), p.velocidadeKmh(), p.ignicao(), p.odometroMetros()))
                .toList();
    }

    static int minutos(double valor) {
        return (int) Math.round(valor);
    }
}
