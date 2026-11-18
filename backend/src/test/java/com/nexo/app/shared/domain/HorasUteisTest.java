package com.nexo.app.shared.domain;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class HorasUteisTest {

    private static OffsetDateTime em(int ano, int mes, int dia, int hora) {
        return LocalDateTime.of(ano, mes, dia, hora, 0).atZone(HorasUteis.FUSO).toOffsetDateTime();
    }

    @Test
    void criadaNaSextaATardeVenceNaTerca() {
        // 06/03/2026 é sexta-feira, sem feriado na semana seguinte.
        assertThat(HorasUteis.somar(em(2026, 3, 6, 15), 48)).isEqualTo(em(2026, 3, 10, 15));
    }

    @Test
    void criadaNoSabadoComecaASegundaAsZeroHora() {
        assertThat(HorasUteis.somar(em(2026, 3, 7, 10), 48)).isEqualTo(em(2026, 3, 11, 0));
    }

    @Test
    void feriadoNoMeioNaoConta() {
        // 21/04/2026 (Tiradentes) é terça-feira.
        assertThat(HorasUteis.somar(em(2026, 4, 20, 9), 48)).isEqualTo(em(2026, 4, 23, 9));
    }

    @Test
    void horasUteisEntreSextaESegundaPulamOFimDeSemana() {
        assertThat(HorasUteis.entre(em(2026, 3, 6, 15), em(2026, 3, 9, 3))).isEqualTo(Duration.ofHours(12));
        assertThat(HorasUteis.entre(em(2026, 3, 9, 3), em(2026, 3, 6, 15))).isEqualTo(Duration.ZERO);
    }

    @Test
    void zeroHorasNoFimDeSemanaVaiParaOProximoDiaUtil() {
        assertThat(HorasUteis.somar(em(2026, 3, 8, 22), 0)).isEqualTo(em(2026, 3, 9, 0));
    }
}
