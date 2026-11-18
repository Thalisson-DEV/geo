package com.nexo.app.modules.frota.domain;

import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class HistoricoItemChecklistTest {

    private static final OffsetDateTime HOJE = OffsetDateTime.of(2026, 10, 15, 7, 0, 0, 0, ZoneOffset.ofHours(-3));

    private static HistoricoItemChecklist.Ocorrencia em(int diasAtras, boolean problema) {
        return new HistoricoItemChecklist.Ocorrencia(HOJE.minusDays(diasAtras), problema);
    }

    @Test
    void contaASequenciaAtualDeProblemasEOUltimoOk() {
        var h = HistoricoItemChecklist.calcular(List.of(em(0, true), em(1, true), em(3, true), em(4, false), em(10, true), em(40, true)));

        assertThat(h.problemaDesde()).isEqualTo(HOJE.minusDays(3));
        assertThat(h.diasComProblema(HOJE)).isEqualTo(3);
        assertThat(h.checklistsSeguidos()).isEqualTo(3);
        assertThat(h.ultimoOkEm()).isEqualTo(HOJE.minusDays(4));
        assertThat(h.vezes30Dias()).as("o de 40 dias atrás fica fora da janela").isEqualTo(4);
    }

    @Test
    void itemQueNuncaEsteveOkENemTemHistorico() {
        var nunca = HistoricoItemChecklist.calcular(List.of(em(0, true), em(2, true)));
        assertThat(nunca.ultimoOkEm()).isNull();
        assertThat(nunca.checklistsSeguidos()).isEqualTo(2);

        var vazio = HistoricoItemChecklist.calcular(List.of());
        assertThat(vazio.checklistsSeguidos()).isZero();
        assertThat(vazio.diasComProblema(HOJE)).isZero();
    }
}
