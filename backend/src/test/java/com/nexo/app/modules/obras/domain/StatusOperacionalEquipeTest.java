package com.nexo.app.modules.obras.domain;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class StatusOperacionalEquipeTest {

    private static final OffsetDateTime AGORA = OffsetDateTime.parse("2026-11-20T14:00:00-03:00");
    private static final Duration INATIVIDADE = Duration.ofMinutes(90);

    private static StatusOperacionalEquipe status(boolean aberto, OffsetDateTime chegada, OffsetDateTime saida, OffsetDateTime apontamento,
                                                  OffsetDateTime impedimento, OffsetDateTime apr, boolean agenda) {
        return StatusOperacionalEquipe.calcular(new StatusOperacionalEquipe.Fatos(aberto, !aberto, chegada, saida, apontamento, impedimento, apr, agenda),
                AGORA, INATIVIDADE);
    }

    @Test
    void semTurnoEEncerrado() {
        assertThat(StatusOperacionalEquipe.calcular(new StatusOperacionalEquipe.Fatos(false, false, null, null, null, null, null, true), AGORA, INATIVIDADE))
                .isEqualTo(StatusOperacionalEquipe.SEM_TURNO);
        assertThat(status(false, null, null, null, null, null, true)).isEqualTo(StatusOperacionalEquipe.ENCERRADO);
    }

    @Test
    void aCaminhoNaObraExecutandoEParada() {
        assertThat(status(true, null, null, null, null, null, true)).isEqualTo(StatusOperacionalEquipe.A_CAMINHO);
        assertThat(status(true, null, null, null, null, null, false)).isEqualTo(StatusOperacionalEquipe.SEM_OBRA);
        assertThat(status(true, AGORA.minusMinutes(20), null, null, null, null, true)).isEqualTo(StatusOperacionalEquipe.NA_OBRA);
        assertThat(status(true, AGORA.minusHours(2), null, AGORA.minusMinutes(10), null, null, true)).isEqualTo(StatusOperacionalEquipe.EM_EXECUCAO);
        assertThat(status(true, AGORA.minusHours(4), null, AGORA.minusHours(2), null, null, true)).isEqualTo(StatusOperacionalEquipe.PARADA);
        assertThat(status(true, AGORA.minusHours(3), AGORA.minusHours(2), null, null, null, true)).isEqualTo(StatusOperacionalEquipe.A_CAMINHO);
    }

    @Test
    void semCondicaoPrevaleceAteNovaAprOuApontamento() {
        assertThat(status(true, AGORA.minusHours(1), null, null, AGORA.minusMinutes(30), AGORA.minusHours(2), true))
                .isEqualTo(StatusOperacionalEquipe.IMPEDIDA);
        assertThat(status(true, AGORA.minusHours(1), null, null, AGORA.minusMinutes(30), AGORA.minusMinutes(5), true))
                .isEqualTo(StatusOperacionalEquipe.NA_OBRA);
    }
}
