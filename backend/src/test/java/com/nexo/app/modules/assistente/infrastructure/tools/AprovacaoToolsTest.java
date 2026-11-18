package com.nexo.app.modules.assistente.infrastructure.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexo.app.modules.assistente.application.agent.AgentRun;
import com.nexo.app.modules.assistente.application.agent.AgentRunContext;
import com.nexo.app.modules.assistente.application.agent.Packet;
import com.nexo.app.modules.assistente.application.agent.ToolContext;
import com.nexo.app.modules.assistente.application.agent.ToolResult;
import com.nexo.app.modules.assistente.application.aprovacao.FilaFalsa;
import com.nexo.app.modules.assistente.application.aprovacao.ServicoAprovacoes;
import com.nexo.app.shared.application.analytics.SemanticQueryContext;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Nas IAs conectadas a decisao e em duas chamadas: a primeira so apresenta e devolve o codigo, a segunda decide. */
class AprovacaoToolsTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final SemanticQueryContext gestor = new SemanticQueryContext(UUID.randomUUID(), Set.of("financeiro:pagamento:aprovar"));
    private final FilaFalsa pagamentos = new FilaFalsa("pagamento", "Solicitação de pagamento", "financeiro:pagamento:aprovar")
            .com(1234, "Oficina Central", "1450.00", true)
            .com(1235, "Posto Juazeiro", "320.50", true);
    private final AprovacaoTools.FerramentaDecisao ferramenta =
            new AprovacaoTools.FerramentaDecisao(new ServicoAprovacoes(List.of(pagamentos), mapper));

    private ToolContext contexto() {
        AgentRun run = new AgentRun(UUID.randomUUID(), gestor.usuarioId(), null, UUID.randomUUID(), null, pacote -> "");
        AgentRunContext agente = new AgentRunContext(run, gestor, "Gestor", null, List.of(), Duration.ofSeconds(30), 0, 0, 0);
        return new ToolContext(agente, "t1", new Packet.Placement(1, 1), 1);
    }

    @Test
    void primeiraChamadaSoApresentaESegundaDecideExatamenteAquilo() throws Exception {
        String pedido = "{\"itens\":[{\"tipo\":\"pagamento\",\"numero\":1234,\"valor_solicitado\":1450}]}";

        ToolResult previa = ferramenta.execute(mapper.readTree(pedido), contexto());
        JsonNode conteudo = mapper.readTree(previa.llmContent());
        assertThat(pagamentos.decididas).isEmpty();
        assertThat(conteudo.path("nada_foi_decidido").asBoolean()).isTrue();
        String codigo = conteudo.path("codigo_confirmacao").asText();
        assertThat(codigo).hasSize(6);

        ToolResult outraLista = ferramenta.execute(mapper.readTree(
                "{\"itens\":[{\"tipo\":\"pagamento\",\"numero\":1235}],\"codigo_confirmacao\":\"" + codigo + "\"}"), contexto());
        assertThat(pagamentos.decididas).isEmpty();
        assertThat(outraLista.llmContent()).contains("nao confere");

        ToolResult decidido = ferramenta.execute(mapper.readTree(
                "{\"itens\":[{\"tipo\":\"pagamento\",\"numero\":1234,\"valor_solicitado\":1450}],\"codigo_confirmacao\":\""
                        + codigo + "\"}"), contexto());
        assertThat(decidido.failed()).isFalse();
        assertThat(pagamentos.decididas).extracting(FilaFalsa.Decidida::numero).containsExactly(1234L);
        assertThat(decidido.llmContent()).contains("Pagamento nº 1234 · Oficina Central · R$ 1.450,00");
    }
}
