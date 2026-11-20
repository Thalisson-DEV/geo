package com.nexo.app.modules.assistente.infrastructure.tools;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ExecutarPythonToolTest {

    private static final byte[] CSV = "nota,valor;1,100;".getBytes(StandardCharsets.UTF_8);

    @Test
    void arquivoDeEntradaQueVoltouIgualNaoESalvoDeNovo() {
        Map<String, String> entradas = Map.of("r34.csv", ExecutarPythonTool.sha256(CSV));

        assertThat(ExecutarPythonTool.entradaInalterada(entradas, "r34.csv", CSV)).isTrue();
    }

    @Test
    void arquivoDeEntradaAlteradoPeloCodigoVoltaComoGerado() {
        Map<String, String> entradas = Map.of("r34.csv", ExecutarPythonTool.sha256(CSV));
        byte[] alterado = "nota,valor;1,999;".getBytes(StandardCharsets.UTF_8);

        assertThat(ExecutarPythonTool.entradaInalterada(entradas, "r34.csv", alterado)).isFalse();
    }

    @Test
    void soVoltamAoUsuarioPlanilhasDocumentosEImagens() {
        assertThat(ExecutarPythonTool.entregavel("Notas_anormais.xlsx")).isTrue();
        assertThat(ExecutarPythonTool.entregavel("grafico.PNG")).isTrue();
        assertThat(ExecutarPythonTool.entregavel("resumo.csv")).isTrue();
        assertThat(ExecutarPythonTool.entregavel("out.pkl")).isFalse();
        assertThat(ExecutarPythonTool.entregavel("base.parquet")).isFalse();
        assertThat(ExecutarPythonTool.entregavel("matriz.npy")).isFalse();
        assertThat(ExecutarPythonTool.entregavel("sem_extensao")).isFalse();
    }

    @Test
    void arquivoNovoComOMesmoConteudoDeUmaEntradaVoltaComoGerado() {
        Map<String, String> entradas = Map.of("r34.csv", ExecutarPythonTool.sha256(CSV));

        assertThat(ExecutarPythonTool.entradaInalterada(entradas, "anomalias.csv", CSV)).isFalse();
    }
}
