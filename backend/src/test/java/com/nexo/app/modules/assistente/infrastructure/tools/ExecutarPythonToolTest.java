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
    void arquivoNovoComOMesmoConteudoDeUmaEntradaVoltaComoGerado() {
        Map<String, String> entradas = Map.of("r34.csv", ExecutarPythonTool.sha256(CSV));

        assertThat(ExecutarPythonTool.entradaInalterada(entradas, "anomalias.csv", CSV)).isFalse();
    }
}
