package com.nexo.app.modules.assistente.application.agent;

import com.nexo.app.shared.application.analytics.SemanticQueryContext;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AgentRunContextCiclosTest {

    private AgentRunContext contexto() {
        SemanticQueryContext usuario = new SemanticQueryContext(UUID.randomUUID(), Set.of());
        AgentRun run = new AgentRun(UUID.randomUUID(), usuario.usuarioId(), null, UUID.randomUUID(), null, pacote -> "");
        return new AgentRunContext(run, usuario, "Ana", null, List.of(), Duration.ofSeconds(30), 0, 0, 0);
    }

    @Test
    void roteiroLongoAmpliaOTetoPadraoDaResposta() {
        AgentRunContext contexto = contexto();
        assertThat(contexto.maxCiclos(16)).isEqualTo(16);

        contexto.ampliarCiclos(28);

        assertThat(contexto.maxCiclos(16)).isEqualTo(28);
    }

    @Test
    void orcamentoDefinidoPorQuemChamouContinuaValendo() {
        AgentRunContext contexto = contexto();
        contexto.definirOrcamento(6, 20);

        contexto.ampliarCiclos(28);

        assertThat(contexto.maxCiclos(16)).isEqualTo(6);
    }
}
