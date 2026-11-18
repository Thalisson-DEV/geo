package com.nexo.app.modules.assistente.infrastructure.tools;

import com.nexo.app.modules.assistente.application.rastreio.SerieEncontrada;
import com.nexo.app.modules.assistente.application.results.TabularData;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RastreioToolsTest {

    @Test
    void seriesPedidasSemRepetirNaOrdemDoUsuario() {
        assertThat(RastreioTools.pedidas(List.of(" ab1 ", "AB1", "", "c2")))
                .containsExactly("ab1", "c2");
    }

    @Test
    void apontaAsSeriesSemNenhumLancamento() {
        List<SerieEncontrada> achadas = List.of(serie("AB1", "4001", true));
        assertThat(RastreioTools.semLancamento(List.of("ab1", "C2"), achadas)).containsExactly("C2");
    }

    @Test
    void tabelaDizSeACorrespondenciaEExataOuPorTrecho() {
        TabularData dados = RastreioTools.tabela(List.of(serie("AB1", "4001", true), serie("AB1", "4002", false)));

        assertThat(dados.totalRows()).isEqualTo(2);
        int nota = dados.columnIndex("nota");
        int correspondencia = dados.columnIndex("correspondencia");
        assertThat(dados.rows().get(0).get(nota)).isEqualTo("4001");
        assertThat(dados.rows().get(0).get(correspondencia)).isEqualTo("exata");
        assertThat(dados.rows().get(1).get(correspondencia)).isEqualTo("por trecho");
        assertThat(dados.rows().get(0).get(dados.columnIndex("data_lancamento"))).asString().startsWith("2026-11-03T10:15");
    }

    private static SerieEncontrada serie(String informada, String nota, boolean exata) {
        return new SerieEncontrada(informada, informada, exata, nota, "COMUM", false,
                OffsetDateTime.parse("2026-11-03T10:15:00-03:00"), "APLICADO", "123", "MEDIDOR", "EQUIPE", "EQ-01",
                "Juazeiro", "CONCLUIDO");
    }
}
