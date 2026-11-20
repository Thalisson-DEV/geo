package com.nexo.app.modules.assistente.application.results;

import com.nexo.app.modules.assistente.application.agent.ToolException;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TabularOpsAtipicosTest {

    private static final List<TabularData.Column> NOTAS = List.of(
            new TabularData.Column("nota", TabularData.ColumnType.TEXTO),
            new TabularData.Column("tipo_servico", TabularData.ColumnType.TEXTO),
            new TabularData.Column("valor", TabularData.ColumnType.NUMERO));

    @Test
    void comparaCadaNotaComAsDoMesmoTipoDeServico() {
        List<List<Object>> linhas = new ArrayList<>();
        for (int i = 0; i < 6; i++) linhas.add(List.of("L" + i, "Ligacao", 100));
        linhas.add(List.of("L-alta", "Ligacao", 400));
        for (int i = 0; i < 6; i++) linhas.add(List.of("C" + i, "Corte", 400));
        TabularData dados = new TabularData(NOTAS, linhas, linhas.size(), false);

        TabularOps.AnomaliasPorGrupo analise = TabularOps.anomaliasPorGrupo(dados, "valor", List.of("tipo_servico"),
                "multiplo", null, 5, false);

        TabularData atipicos = analise.dados();
        assertThat(atipicos.totalRows()).isEqualTo(1);
        List<Object> linha = atipicos.rows().getFirst();
        assertThat(linha.get(0)).isEqualTo("L-alta");
        assertThat(linha.get(atipicos.columnIndex("tipico_grupo"))).isEqualTo(100L);
        assertThat(linha.get(atipicos.columnIndex("vezes_o_tipico"))).isEqualTo(4L);
        assertThat(linha.get(atipicos.columnIndex("anomalia"))).isEqualTo("ACIMA_DO_TIPICO");
        assertThat((String) linha.get(atipicos.columnIndex("motivo")))
                .contains("4x o tipico de 100").contains("tipo_servico Ligacao");
        assertThat(analise.gruposAvaliados()).isEqualTo(2);
    }

    @Test
    void grupoSemParesSuficientesFicaDeFora() {
        List<List<Object>> linhas = new ArrayList<>();
        for (int i = 0; i < 6; i++) linhas.add(List.of("L" + i, "Ligacao", 100));
        linhas.add(List.of("R1", "Raro", 50));
        linhas.add(List.of("R2", "Raro", 5000));
        TabularData dados = new TabularData(NOTAS, linhas, linhas.size(), false);

        TabularOps.AnomaliasPorGrupo analise = TabularOps.anomaliasPorGrupo(dados, "valor", List.of("tipo_servico"),
                "multiplo", 2.5, 5, false);

        assertThat(analise.dados().totalRows()).isZero();
        assertThat(analise.gruposIgnorados()).isEqualTo(1);
    }

    @Test
    void metodoInvalidoExplicaAsOpcoes() {
        TabularData dados = new TabularData(NOTAS, List.of(), 0, false);
        assertThatThrownBy(() -> TabularOps.anomaliasPorGrupo(dados, "valor", List.of(), "media", null, 5, false))
                .isInstanceOf(ToolException.class).hasMessageContaining("multiplo");
    }

    @Test
    void apontaAcaoRaraEAcaoRepetidaNoTipoDeServico() {
        List<TabularData.Column> colunas = List.of(
                new TabularData.Column("nota", TabularData.ColumnType.TEXTO),
                new TabularData.Column("tipo_servico", TabularData.ColumnType.TEXTO),
                new TabularData.Column("acao", TabularData.ColumnType.TEXTO));
        List<List<Object>> linhas = new ArrayList<>();
        for (int i = 0; i < 20; i++) linhas.add(List.of("N" + i, "Ligacao", "Instalar medidor"));
        linhas.add(List.of("N-rara", "Ligacao", "Instalar medidor"));
        linhas.add(List.of("N-rara", "Ligacao", "Trocar poste"));
        linhas.add(List.of("N-repetida", "Ligacao", "Instalar medidor"));
        linhas.add(List.of("N-repetida", "Ligacao", "Instalar medidor"));
        TabularData dados = new TabularData(colunas, linhas, linhas.size(), false);

        TabularOps.ComposicaoIncomum analise = TabularOps.composicaoIncomum(dados, "nota", List.of("tipo_servico"),
                "acao", 0.10, 10, 3);

        TabularData resultado = analise.dados();
        assertThat(resultado.rows()).extracting(row -> row.get(0)).containsExactlyInAnyOrder("N-rara", "N-repetida");
        int detalhe = resultado.columnIndex("detalhe_incomuns");
        List<Object> rara = resultado.rows().stream().filter(row -> row.get(0).equals("N-rara")).findFirst().orElseThrow();
        List<Object> repetida = resultado.rows().stream().filter(row -> row.get(0).equals("N-repetida")).findFirst().orElseThrow();
        assertThat((String) rara.get(detalhe)).startsWith("Trocar poste");
        assertThat((String) repetida.get(detalhe)).contains("repetido 2x");
        assertThat(analise.registrosAvaliados()).isEqualTo(22);
    }
}
