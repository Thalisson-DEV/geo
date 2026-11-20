package com.nexo.app.modules.assistente.application.agent;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ToolExecutorArgumentosTest {

    @Test
    void codigoLongoSemFecharOObjetoEDitoComoCortado() {
        String cortado = "{\"code\": \"import pandas as pd\\n" + "x = 1\\n".repeat(600);

        assertThat(ToolExecutor.erroDeArgumentos("executar_python", cortado))
                .contains("chegaram cortados").contains("Nao repita a mesma chamada");
    }

    @Test
    void jsonCurtoInvalidoContinuaComAMensagemDeSchema() {
        assertThat(ToolExecutor.erroDeArgumentos("consultar_sql", "{sql: select"))
                .startsWith("Argumentos JSON invalidos para consultar_sql");
    }
}
