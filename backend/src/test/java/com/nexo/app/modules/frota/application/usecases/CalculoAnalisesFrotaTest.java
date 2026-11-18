package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.execucao.TurnoVeiculoApi;
import com.nexo.app.modules.execucao.TurnoVeiculoApi.NotaGeorreferenciada;
import com.nexo.app.modules.execucao.TurnoVeiculoApi.TurnoDoVeiculo;
import com.nexo.app.modules.frota.application.TelemetriaFrotaProperties;
import com.nexo.app.modules.frota.application.usecases.ReferenciasFrota.EquipeComBase;
import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import com.nexo.app.modules.frota.domain.RastreadorTelemetria;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimentoGeo;
import com.nexo.app.modules.frota.domain.SituacaoNotaGeo;
import com.nexo.app.modules.frota.domain.TipoParadaTurno;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository.AbastecimentoAnalisado;
import com.nexo.app.modules.frota.infrastructure.persistence.PosicaoTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RastreadorTelemetriaRepository;
import com.nexo.app.modules.rh.BaseOperacionalResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CalculoAnalisesFrotaTest {

    @Mock
    private RastreadorTelemetriaRepository rastreadores;
    @Mock
    private PosicaoTelemetriaRepository posicoes;
    @Mock
    private AnaliseTelemetriaRepository analises;
    @Mock
    private com.nexo.app.modules.frota.infrastructure.persistence.AbastecimentoRepository abastecimentos;
    @Mock
    private org.springframework.transaction.support.TransactionTemplate transacao;
    @Mock
    private ReferenciasFrota referencias;
    @Mock
    private TurnoVeiculoApi turnoApi;
    @Mock
    private TelemetriaFrotaProperties properties;
    @InjectMocks
    private CalculoAnalisesFrota calculo;

    private static final OffsetDateTime T0 = OffsetDateTime.of(2026, 10, 26, 11, 0, 0, 0, ZoneOffset.UTC);
    private static final double BASE_LAT = -12.20;
    private static final double LNG = -38.90;
    private final UUID idVeiculo = UUID.randomUUID();
    private final UUID idRastreador = UUID.randomUUID();

    @BeforeEach
    void preparar() {
        var rastreador = new RastreadorTelemetria(ProvedorTelemetria.ZUQ, "1");
        ReflectionTestUtils.setField(rastreador, "id", idRastreador);
        when(rastreadores.findAllByIdVeiculoAndAtivoTrueOrderByUltimaComunicacaoDesc(idVeiculo)).thenReturn(List.of(rastreador));
        when(analises.rastreadorPrincipal(any(), any(), any())).thenReturn(idRastreador);
    }

    private static PosicaoTelemetriaRepository.Ponto p(int minuto, double lat, double velocidade, boolean ignicao) {
        return new PosicaoTelemetriaRepository.Ponto(T0.plusMinutes(minuto), lat, LNG, velocidade, ignicao, null, null);
    }

    @Test
    void turnoClassificaParadasSaidaDaBaseENotasPelaPosicaoDoVeiculo() {
        // Parado na base 20 min, vai até o serviço (-12.25), para 30 min, vai a outro ponto (-12.30), para 20 min sem nota e volta.
        when(posicoes.trajeto(anyList(), any(), any(), anyInt())).thenReturn(List.of(
                p(0, BASE_LAT, 0, true), p(20, BASE_LAT, 40, true), p(30, -12.25, 0, false), p(60, -12.25, 40, true),
                p(70, -12.30, 0, false), p(90, -12.30, 40, true), p(100, BASE_LAT, 0, false), p(120, BASE_LAT, 0, false)));
        var turno = new TurnoDoVeiculo(UUID.randomUUID(), UUID.randomUUID(), idVeiculo, T0, T0.plusMinutes(120), false);
        var notas = List.of(
                new NotaGeorreferenciada(UUID.randomUUID(), turno.idTurno(), "N1", T0.plusMinutes(45), true, new BigDecimal("300.00"), -12.2505, LNG),
                new NotaGeorreferenciada(UUID.randomUUID(), turno.idTurno(), "N2", T0.plusMinutes(80), true, new BigDecimal("200.00"), -12.40, LNG),
                new NotaGeorreferenciada(UUID.randomUUID(), turno.idTurno(), "N3", T0.plusMinutes(85), false, new BigDecimal("50.00"), null, null),
                new NotaGeorreferenciada(UUID.randomUUID(), turno.idTurno(), "N4", T0.plusMinutes(200), true, null, -12.10, LNG));
        var base = new BaseOperacionalResponse(UUID.randomUUID(), "FEIRA", "BA", null, null, BASE_LAT, LNG, 0, true);

        var calculado = calculo.calcularTurno(turno, notas, new EquipeComBase(turno.idEquipe(), "EQ-01", base), T0);

        var r = calculado.resumo();
        assertThat(r.comTelemetria()).isTrue();
        assertThat(r.saidaBaseEm()).isEqualTo(T0.plusMinutes(30));
        assertThat(r.chegadaBaseEm()).isEqualTo(T0.plusMinutes(100));
        assertThat(r.minutosParadoBase()).isEqualTo(20 + 20);
        assertThat(r.minutosParadoServico()).isEqualTo(30);
        assertThat(r.minutosParadoSemServico()).isEqualTo(20);
        assertThat(r.valorFaturado()).as("só as concluídas").isEqualByComparingTo("500.00");
        assertThat(r.notasNoLocal()).isEqualTo(1);
        assertThat(r.notasForaLocal()).isEqualTo(1);
        assertThat(r.notasSemDado()).isEqualTo(2);
        assertThat(calculado.paradas()).extracting(CalculoAnalisesFrota.ParadaTurno::tipo).containsExactly(
                TipoParadaTurno.BASE, TipoParadaTurno.SERVICO, TipoParadaTurno.SEM_SERVICO, TipoParadaTurno.BASE);
        assertThat(calculado.notas()).extracting(AnaliseTelemetriaRepository.NotaTurno::situacao).containsExactly(
                SituacaoNotaGeo.NO_LOCAL.name(), SituacaoNotaGeo.FORA_DO_LOCAL.name(),
                SituacaoNotaGeo.SEM_COORDENADA_NOTA.name(), SituacaoNotaGeo.SEM_POSICAO_VEICULO.name());
        assertThat(calculado.notas().get(1).distanciaMetros()).isBetween(11_000, 11_200);
    }

    @Test
    void turnoSemPosicaoFicaSemTelemetriaEAsNotasSemDado() {
        when(analises.rastreadorPrincipal(any(), any(), any())).thenReturn(null);
        var turno = new TurnoDoVeiculo(UUID.randomUUID(), UUID.randomUUID(), idVeiculo, T0, null, false);
        var nota = new NotaGeorreferenciada(UUID.randomUUID(), turno.idTurno(), "N1", T0.plusMinutes(5), true, BigDecimal.TEN, -12.2, LNG);

        var calculado = calculo.calcularTurno(turno, List.of(nota), null, T0.plusHours(1));

        assertThat(calculado.resumo().comTelemetria()).isFalse();
        assertThat(calculado.resumo().fim()).as("aberto vai até agora").isEqualTo(T0.plusHours(1));
        assertThat(calculado.resumo().notasSemDado()).isEqualTo(1);
    }

    @Test
    void postoAprendidoPelaMedianaDasAmostrasParadasEReclassificaPelaDistancia() {
        UUID posto = UUID.randomUUID();
        var amostras = new ArrayList<AbastecimentoAnalisado>();
        double[][] lugares = {{-12.2000, LNG}, {-12.2001, LNG}, {-12.1999, LNG}, {-12.2002, LNG}, {-12.2600, LNG}};
        for (double[] l : lugares) {
            amostras.add(new AbastecimentoAnalisado(UUID.randomUUID(), idVeiculo, posto, T0, "POSTO_SEM_REFERENCIA", l[0], l[1], 0.0, null));
        }
        amostras.add(new AbastecimentoAnalisado(UUID.randomUUID(), idVeiculo, UUID.randomUUID(), T0, "POSTO_SEM_REFERENCIA", -12.0, LNG, 0.0, null));
        when(properties.getRetencaoPosicoesDias()).thenReturn(180);
        when(analises.listarAbastecimentosComPosicao(any())).thenReturn(amostras);
        var longe = org.mockito.Mockito.mock(com.nexo.app.modules.frota.domain.Abastecimento.class);
        when(longe.getId()).thenReturn(amostras.get(4).idAbastecimento());
        when(abastecimentos.findAllById(any())).thenReturn(List.of(longe));
        org.mockito.Mockito.doAnswer(inv -> {
            inv.<java.util.function.Consumer<org.springframework.transaction.TransactionStatus>>getArgument(0).accept(null);
            return null;
        }).when(transacao).executeWithoutResult(any());

        calculo.aprenderPostos();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<AnaliseTelemetriaRepository.PostoLocalizado>> postos = ArgumentCaptor.forClass(List.class);
        verify(analises).substituirPostos(postos.capture());
        assertThat(postos.getValue()).singleElement().satisfies(l -> {
            assertThat(l.amostras()).as("a de 6 km fica fora do centro").isEqualTo(4);
            assertThat(l.latitude()).isBetween(-12.2002, -12.1999);
        });
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<AbastecimentoAnalisado>> gravados = ArgumentCaptor.forClass(List.class);
        verify(analises).gravarAbastecimentos(gravados.capture());
        assertThat(gravados.getValue()).extracting(AbastecimentoAnalisado::situacao).containsExactly(
                "NO_POSTO", "NO_POSTO", "NO_POSTO", "NO_POSTO", SituacaoAbastecimentoGeo.LONGE_DO_POSTO.name(),
                SituacaoAbastecimentoGeo.POSTO_SEM_REFERENCIA.name());
        // Só o que passou a ficar longe ganha o alerta no próprio abastecimento.
        @SuppressWarnings("unchecked")
        ArgumentCaptor<java.util.Collection<UUID>> ids = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(abastecimentos).findAllById(ids.capture());
        assertThat(ids.getValue()).containsExactly(amostras.get(4).idAbastecimento());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<com.nexo.app.modules.frota.domain.AnaliseAbastecimento.Alerta>> alertas = ArgumentCaptor.forClass(List.class);
        verify(longe).registrarAlertas(org.mockito.ArgumentMatchers.eq(com.nexo.app.modules.frota.domain.EtapaAlertaAbastecimento.TELEMETRIA),
                alertas.capture());
        assertThat(alertas.getValue()).singleElement().satisfies(al -> {
            assertThat(al.tipo()).isEqualTo(com.nexo.app.modules.frota.domain.TipoAlertaAbastecimento.LONGE_DO_POSTO);
            assertThat(al.mensagem()).contains("km do lugar onde ele costuma abastecer");
        });
    }
}
