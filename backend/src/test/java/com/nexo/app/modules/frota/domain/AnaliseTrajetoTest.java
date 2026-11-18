package com.nexo.app.modules.frota.domain;

import com.nexo.app.modules.frota.domain.AnaliseTrajeto.Estado;
import com.nexo.app.modules.frota.domain.AnaliseTrajeto.Ponto;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class AnaliseTrajetoTest {

    /** Segunda-feira, 10h em São Paulo. */
    private static final OffsetDateTime SEGUNDA_10H = OffsetDateTime.of(2026, 10, 26, 13, 0, 0, 0, ZoneOffset.UTC);

    private static Ponto ponto(int minuto, double lat, Double velocidade, Boolean ignicao, Long odometro) {
        return new Ponto(SEGUNDA_10H.plusMinutes(minuto), lat, -38.9, velocidade, ignicao, odometro);
    }

    @Test
    void trechoTemOEstadoDoPontoQueOAbreEUsaOOdometroQuandoPlausivel() {
        var trechos = AnaliseTrajeto.trechos(List.of(
                ponto(0, -12.20, 0.0, false, 1_000_000L),
                ponto(30, -12.20, 0.0, true, 1_000_000L),
                ponto(40, -12.20, 50.0, true, 1_000_000L),
                ponto(50, -12.25, 0.0, true, 1_008_000L)));

        assertThat(trechos).extracting(AnaliseTrajeto.Trecho::estado)
                .containsExactly(Estado.DESLIGADO, Estado.LIGADO_PARADO, Estado.MOVIMENTO);
        assertThat(trechos.get(2).metros()).as("odômetro, não a linha reta").isEqualTo(8_000);
        assertThat(trechos.get(1).minutos()).isEqualTo(10);
    }

    @Test
    void odometroQueSaltaAlemDoPossivelCaiNaLinhaReta() {
        var trechos = AnaliseTrajeto.trechos(List.of(
                ponto(0, -12.20, 40.0, true, 1_000_000L),
                ponto(2, -12.21, 40.0, true, 9_000_000L)));

        assertThat(trechos.get(0).metros()).isCloseTo(1_112, within(5.0));
    }

    @Test
    void odometroParadoComOVeiculoAndandoUsaALinhaRetaEIgnoraOTremorDoGps() {
        var trechos = AnaliseTrajeto.trechos(List.of(
                ponto(0, -12.20, 40.0, true, 1_000L),
                ponto(2, -12.21, 40.0, true, 1_000L),
                new Ponto(SEGUNDA_10H.plusMinutes(32), -12.2101, -38.9, 0.0, false, 1_000L)));

        assertThat(trechos.get(0).metros()).isCloseTo(1_112, within(5.0));
        assertThat(trechos.get(1).metros()).as("11 m é ruído").isZero();
    }

    @Test
    void velocidadeDoUltimoPontoNaoViraUmaHoraAndandoSemDeslocamento() {
        var trechos = AnaliseTrajeto.trechos(List.of(ponto(0, -12.2, 6.0, null, null), ponto(61, -12.2001, 0.0, null, null)));

        assertThat(trechos.get(0).estado()).isEqualTo(Estado.DESLIGADO);
    }

    @Test
    void lacunaDeSinalLigadoContaNoMaximoQuarentaMinutos() {
        var trechos = AnaliseTrajeto.trechos(List.of(ponto(0, -12.2, 0.0, true, null), ponto(180, -12.2, 0.0, true, null)));

        assertThat(trechos.get(0).estado()).isEqualTo(Estado.LIGADO_PARADO);
        assertThat(trechos.get(0).minutos()).isEqualTo(40);
    }

    @Test
    void semVelocidadeODeslocamentoDecideSeAndou() {
        var trechos = AnaliseTrajeto.trechos(List.of(ponto(0, -12.20, null, null, null), ponto(5, -12.23, null, null, null)));

        assertThat(trechos.get(0).estado()).isEqualTo(Estado.MOVIMENTO);
    }

    @Test
    void resumoSeparaOQueAndouForaDoExpediente() {
        var expediente = new Expediente(LocalTime.of(6, 0), LocalTime.of(19, 0), false);
        var noite = SEGUNDA_10H.plusHours(12); // 22h
        var trechos = AnaliseTrajeto.trechos(List.of(
                ponto(0, -12.20, 40.0, true, 0L),
                ponto(10, -12.21, 0.0, false, 5_000L),
                new Ponto(noite, -12.21, -38.9, 30.0, true, 5_000L),
                new Ponto(noite.plusMinutes(10), -12.22, -38.9, 0.0, false, 9_000L)));

        var resumo = AnaliseTrajeto.resumir(trechos, expediente::dentro);

        assertThat(resumo.km()).isEqualTo(9.0);
        assertThat(resumo.minutosMovimento()).isEqualTo(20);
        assertThat(resumo.kmForaExpediente()).isEqualTo(4.0);
        assertThat(resumo.minutosForaExpediente()).isEqualTo(10);
        assertThat(resumo.primeiraPartida()).isEqualTo(SEGUNDA_10H);
        assertThat(resumo.ultimaParada()).isEqualTo(noite.plusMinutes(10));
    }

    @Test
    void expedienteSemSabadoEDomingoNuncaContam() {
        var expediente = new Expediente(LocalTime.of(6, 0), LocalTime.of(19, 0), false);
        assertThat(expediente.dentro(SEGUNDA_10H)).isTrue();
        assertThat(expediente.dentro(SEGUNDA_10H.minusDays(2))).as("sábado").isFalse();
        assertThat(new Expediente(LocalTime.of(6, 0), LocalTime.of(19, 0), true).dentro(SEGUNDA_10H.minusDays(2))).isTrue();
        assertThat(expediente.dentro(SEGUNDA_10H.minusDays(1))).as("domingo").isFalse();
        assertThat(expediente.dentro(SEGUNDA_10H.plusHours(9))).as("19h já é fora").isFalse();
    }

    @Test
    void paradasJuntamTrechosParadosEIgnoramAsCurtas() {
        var trechos = AnaliseTrajeto.trechos(List.of(
                ponto(0, -12.20, 40.0, true, null),
                ponto(5, -12.25, 0.0, true, null),
                ponto(10, -12.25, 0.0, false, null),
                ponto(30, -12.25, 30.0, true, null),
                ponto(32, -12.26, 0.0, true, null),
                ponto(34, -12.27, 30.0, true, null)));

        var paradas = AnaliseTrajeto.paradas(trechos);

        assertThat(paradas).singleElement().satisfies(p -> {
            assertThat(p.de()).isEqualTo(SEGUNDA_10H.plusMinutes(5));
            assertThat(p.minutos()).isEqualTo(25);
            assertThat(p.minutosLigado()).isEqualTo(5);
            assertThat(p.latitude()).isEqualTo(-12.25);
        });
    }

    @Test
    void posicaoNoInstanteInterpolaOuUsaOPontoMaisPertoDentroDaTolerancia() {
        var pontos = List.of(ponto(0, -12.20, 40.0, true, null), ponto(10, -12.30, 40.0, true, null));
        var tolerancia = Duration.ofMinutes(15);

        assertThat(AnaliseTrajeto.posicaoEm(pontos, SEGUNDA_10H.plusMinutes(5), tolerancia).orElseThrow().latitude())
                .isCloseTo(-12.25, within(1e-9));
        assertThat(AnaliseTrajeto.posicaoEm(pontos, SEGUNDA_10H.plusMinutes(20), tolerancia).orElseThrow().latitude())
                .isEqualTo(-12.30);
        assertThat(AnaliseTrajeto.posicaoEm(pontos, SEGUNDA_10H.plusMinutes(40), tolerancia)).as("sem dado").isEmpty();
    }

    @Test
    void centroDescartaPoucosPontosForaPelaMediana() {
        var centro = AnaliseTrajeto.centro(List.of(new double[]{-12.0, -38.0}, new double[]{-12.0001, -38.0001},
                new double[]{-12.0002, -38.0}, new double[]{-13.5, -39.0})).orElseThrow();

        assertThat(AnaliseTrajeto.distanciaMetros(centro[0], centro[1], -12.0001, -38.0)).isLessThan(30);
    }

    @Test
    void leituraDensaEspacadaGuardaOKmQueORuidoApagariaEAParada() {
        // A 20 km/h, uma leitura a cada 6 s (33 m: abaixo do ruído do GPS par a par), por 10 minutos; depois 10 minutos parado.
        var densa = new java.util.ArrayList<Ponto>();
        for (int s = 0; s <= 600; s += 6) {
            densa.add(new Ponto(SEGUNDA_10H.plusSeconds(s), -12.0 - s * 20 / 3.6 / 111_195, -38.9, 20.0, true, null));
        }
        double latParado = densa.getLast().latitude();
        for (int s = 606; s <= 1200; s += 6) {
            densa.add(new Ponto(SEGUNDA_10H.plusSeconds(s), latParado + (s % 12 == 0 ? 0.00005 : 0), -38.9, 0.0, true, null));
        }

        assertThat(AnaliseTrajeto.resumir(AnaliseTrajeto.trechos(densa), i -> true).km()).as("sem espaçar").isLessThan(0.5);
        var espacada = AnaliseTrajeto.espacarLeituraDensa(densa);
        var trechos = AnaliseTrajeto.trechos(espacada);
        assertThat(AnaliseTrajeto.resumir(trechos, i -> true).km()).isCloseTo(3.33, within(0.2));
        assertThat(espacada.getLast()).isEqualTo(densa.getLast());
        assertThat(AnaliseTrajeto.paradas(trechos)).singleElement()
                .satisfies(p -> assertThat(p.minutos()).isCloseTo(10, within(0.5)));
    }
}
