package com.nexo.app.modules.assistente.infrastructure.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.nexo.app.modules.assistente.application.agent.AcaoComPrevia;
import com.nexo.app.modules.assistente.application.agent.AgentRunContext;
import com.nexo.app.modules.assistente.application.agent.AgentTool;
import com.nexo.app.modules.assistente.application.agent.BaseTool;
import com.nexo.app.modules.assistente.application.agent.JsonSchemas;
import com.nexo.app.modules.assistente.application.agent.RiskLevel;
import com.nexo.app.modules.assistente.application.agent.ToolArgs;
import com.nexo.app.modules.assistente.application.agent.ToolContext;
import com.nexo.app.modules.assistente.application.agent.ToolException;
import com.nexo.app.modules.assistente.application.agent.ToolKind;
import com.nexo.app.modules.assistente.application.agent.ToolResult;
import com.nexo.app.modules.assistente.application.aprovacao.ProvedorAprovacoes;
import com.nexo.app.modules.assistente.application.aprovacao.ServicoAprovacoes;
import com.nexo.app.modules.assistente.application.aprovacao.ServicoAprovacoes.Pendente;
import com.nexo.app.modules.assistente.application.aprovacao.SolicitacaoEmAprovacao;
import com.nexo.app.shared.application.analytics.SemanticQueryContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Aprovacoes pela Bússola: o gestor pergunta o que espera por ele ({@code aprovacoes_pendentes}), confere uma
 * solicitacao ({@code detalhar_aprovacao}) e decide uma ou varias de uma vez ({@code decidir_solicitacoes}). No
 * chat a decisao vira um cartao com a lista exata do que sera aprovado ou rejeitado; nada e decidido sem o
 * usuario confirmar. Nas IAs conectadas (MCP) a confirmacao e em duas chamadas: a primeira so apresenta a lista e
 * devolve um codigo, a segunda decide exatamente aquela lista.
 */
@Configuration(proxyBeanMethods = false)
public class AprovacaoTools {

    private static final int MAXIMO_LISTADO = 80;

    @Bean
    AgentTool aprovacoesPendentesTool(ServicoAprovacoes servico, ObjectMapper mapper) {
        return new BaseTool("aprovacoes_pendentes", "Ver o que espera aprovação",
                "Lista as solicitacoes que aguardam a decisao do usuario (ex.: solicitacoes de compra e de pagamento do "
                        + "Financeiro), da mais antiga para a mais nova, com numero, solicitante, fornecedor, valor e descricao. "
                        + "Use quando o usuario perguntar o que tem para aprovar ou pedir para aprovar/rejeitar algo sem dar o "
                        + "numero exato. Filtre com 'tipo' e 'busca' (fornecedor, solicitante, base, descricao ou numero).",
                JsonSchemas.object()
                        .prop("tipo", JsonSchemas.string("Tipo de solicitacao (ex.: compra, pagamento). Vazio = todos"))
                        .prop("busca", JsonSchemas.string("Texto para filtrar (opcional)"))
                        .build(),
                ToolKind.DATA, Set.of(), Duration.ofSeconds(40)) {
            @Override
            public Set<String> requiredAuthorities() {
                return servico.todasAutoridades();
            }

            @Override
            public int maxResultChars() {
                return 40_000;
            }

            @Override
            public String progressLabel(JsonNode arguments) {
                return "Vendo o que espera aprovação";
            }

            @Override
            public ToolResult execute(JsonNode arguments, ToolContext context) {
                List<Pendente> pendentes = servico.pendentes(context.security(), ToolArgs.text(arguments, "tipo"),
                        ToolArgs.text(arguments, "busca"));
                Map<String, Object> resposta = new LinkedHashMap<>();
                Map<String, Map<String, Object>> totais = new LinkedHashMap<>();
                List<Map<String, Object>> itens = new ArrayList<>();
                for (Pendente p : pendentes) {
                    SolicitacaoEmAprovacao s = p.solicitacao();
                    Map<String, Object> total = totais.computeIfAbsent(p.provedor().rotulo(), ignored -> {
                        Map<String, Object> novo = new LinkedHashMap<>();
                        novo.put("tipo", p.provedor().tipo());
                        novo.put("quantidade", 0);
                        novo.put("valor", BigDecimal.ZERO);
                        return novo;
                    });
                    total.put("quantidade", (Integer) total.get("quantidade") + 1);
                    if (s.valor() != null) total.put("valor", ((BigDecimal) total.get("valor")).add(s.valor()));
                    if (itens.size() < MAXIMO_LISTADO) itens.add(linha(p.provedor(), s));
                }
                totais.values().forEach(t -> t.put("valor", ServicoAprovacoes.moeda((BigDecimal) t.get("valor"))));
                resposta.put("aguardando_decisao", pendentes.size());
                resposta.put("por_tipo", totais);
                resposta.put("solicitacoes", itens);
                if (pendentes.size() > itens.size()) {
                    resposta.put("aviso", "Mostrando as " + itens.size() + " mais antigas de " + pendentes.size()
                            + ". Use 'busca' ou 'tipo' para achar as demais.");
                }
                resposta.put("orientacao", "Ao falar com o usuario, identifique cada solicitacao pelo tipo e numero, "
                        + "fornecedor e valor (ex.: Pagamento nº 1234 · Fornecedor X · R$ 1.450,00). Para decidir, chame "
                        + "decidir_solicitacoes com tipo, numero e valor_solicitado de cada uma.");
                return ToolResult.of(json(mapper, resposta), pendentes.size() + " aguardando decisão");
            }
        };
    }

    @Bean
    AgentTool detalharAprovacaoTool(ServicoAprovacoes servico, ObjectMapper mapper) {
        return new BaseTool("detalhar_aprovacao", "Ver solicitação para aprovar",
                "Mostra uma solicitacao inteira pelo numero que aparece na tela (quem pediu, fornecedor, valor, forma de "
                        + "pagamento, vencimento, documentos, descricao e demais campos do formulario) e se ainda aguarda "
                        + "decisao. Use antes de decidir quando o usuario quiser conferir os detalhes.",
                JsonSchemas.object()
                        .required("numero", JsonSchemas.integer("Numero da solicitacao", 1, null))
                        .prop("tipo", JsonSchemas.string("Tipo (compra, pagamento). Vazio procura em todos"))
                        .build(),
                ToolKind.DATA, Set.of(), Duration.ofSeconds(30)) {
            @Override
            public Set<String> requiredAuthorities() {
                return servico.todasAutoridades();
            }

            @Override
            public String progressLabel(JsonNode arguments) {
                Integer numero = ToolArgs.integer(arguments, "numero");
                return numero == null ? "Abrindo a solicitação" : "Abrindo a solicitação nº " + numero;
            }

            @Override
            public ToolResult execute(JsonNode arguments, ToolContext context) {
                Integer numero = ToolArgs.integer(arguments, "numero");
                if (numero == null) throw new ToolException("Informe o numero da solicitacao.");
                List<Pendente> achados = servico.detalhar(context.security(), ToolArgs.text(arguments, "tipo"), numero);
                if (achados.isEmpty()) {
                    return ToolResult.of("{\"encontrada\":false,\"mensagem\":\"Nenhuma solicitacao nº " + numero
                            + " que o usuario possa decidir.\"}", "Não encontrada").asFailure();
                }
                List<Map<String, Object>> lista = new ArrayList<>();
                for (Pendente p : achados) {
                    Map<String, Object> item = linha(p.provedor(), p.solicitacao());
                    Map<String, String> ficha = new LinkedHashMap<>();
                    p.solicitacao().ficha().forEach(c -> ficha.put(c.rotulo(), c.valor()));
                    item.put("ficha", ficha);
                    lista.add(item);
                }
                Map<String, Object> resposta = new LinkedHashMap<>();
                resposta.put("solicitacoes", lista);
                if (achados.size() > 1) {
                    resposta.put("atencao", "Ha mais de uma solicitacao com este numero: confirme com o usuario o tipo.");
                }
                return ToolResult.of(json(mapper, resposta), achados.getFirst().solicitacao().titulo());
            }
        };
    }

    @Bean
    AgentTool decidirSolicitacoesTool(ServicoAprovacoes servico) {
        return new FerramentaDecisao(servico);
    }

    private static Map<String, Object> linha(ProvedorAprovacoes fila, SolicitacaoEmAprovacao s) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("tipo", fila.tipo());
        item.put("numero", s.numero());
        item.put("titulo", s.titulo());
        item.put("situacao", s.situacao());
        if (s.solicitante() != null) item.put("solicitante", s.solicitante());
        if (s.fornecedor() != null) item.put("fornecedor", s.fornecedor());
        if (s.valor() != null) {
            item.put("valor", s.valor());
            item.put("valor_formatado", ServicoAprovacoes.moeda(s.valor()));
        }
        if (s.valorAprovado() != null) item.put("valor_aprovado", ServicoAprovacoes.moeda(s.valorAprovado()));
        if (s.base() != null) item.put("base", s.base());
        if (s.descricao() != null) item.put("descricao", ServicoAprovacoes.resumir(s.descricao(), 200));
        if (s.enviadaEm() != null) {
            item.put("enviada_em", ServicoAprovacoes.data(s.enviadaEm()));
            if (s.aguardando()) item.put("dias_aguardando", ServicoAprovacoes.diasAguardando(s.enviadaEm()));
        }
        return item;
    }

    private static String json(ObjectMapper mapper, Object valor) {
        try {
            return mapper.writeValueAsString(valor);
        } catch (Exception exception) {
            throw new ToolException("Falha ao montar a resposta.");
        }
    }

    /**
     * Aprovar ou rejeitar uma ou varias solicitacoes. No chat vira o cartao de confirmacao; em integracoes
     * ({@link #execute}) a primeira chamada so apresenta a lista e a segunda, com o codigo devolvido, decide.
     */
    static final class FerramentaDecisao extends BaseTool implements AcaoComPrevia {

        private final ServicoAprovacoes servico;

        FerramentaDecisao(ServicoAprovacoes servico) {
            super("decidir_solicitacoes", "Aprovar ou rejeitar solicitações",
                    "Aprova ou rejeita uma ou varias solicitacoes que aguardam o usuario (compras e pagamentos do "
                            + "Financeiro...). Identifique cada uma pelo tipo e pelo numero da tela, e envie em valor_solicitado "
                            + "o valor que o usuario viu: se nao conferir, a solicitacao fica fora da decisao. Nunca deduza numeros: "
                            + "se o usuario disser 'a do fornecedor X' ou 'todas', ache-as antes com aprovacoes_pendentes. Rejeitar "
                            + "exige motivo (observacao). Aprovar por menos que o solicitado: valor_aprovado. NUNCA decide direto: "
                            + "apresenta ao usuario a lista exata (numero, fornecedor, valor) para ele confirmar. Depois, informe "
                            + "exatamente quais foram aprovadas e quais nao.",
                    JsonSchemas.object()
                            .required("itens", JsonSchemas.array("Solicitacoes a decidir (ate " + ServicoAprovacoes.MAXIMO_POR_DECISAO + ")",
                                    JsonSchemas.object()
                                            .required("tipo", JsonSchemas.string("Tipo: compra ou pagamento"))
                                            .required("numero", JsonSchemas.integer("Numero da solicitacao na tela", 1, null))
                                            .prop("valor_solicitado", JsonSchemas.number("Valor solicitado que o usuario viu, para conferir"))
                                            .prop("decisao", JsonSchemas.enumString("aprovar (padrao) ou rejeitar", List.of("aprovar", "rejeitar")))
                                            .prop("valor_aprovado", JsonSchemas.number("So para aprovar por menos que o solicitado"))
                                            .prop("observacao", JsonSchemas.string("Observacao da aprovacao ou motivo da rejeicao"))
                                            .build()))
                            .prop("observacao", JsonSchemas.string("Observacao ou motivo para todas que nao tiverem o proprio"))
                            .prop("codigo_confirmacao", JsonSchemas.string("So em integracoes: o codigo devolvido pela chamada "
                                    + "anterior, depois que o usuario confirmar a lista. Sem ele nada e decidido"))
                            .build(),
                    ToolKind.WRITE, Set.of(), Duration.ofSeconds(120));
            this.servico = servico;
        }

        @Override
        public RiskLevel riskLevel() {
            return RiskLevel.WRITE_HIGH;
        }

        @Override
        public Set<String> requiredAuthorities() {
            return servico.todasAutoridades();
        }

        @Override
        public boolean isAvailable(AgentRunContext context) {
            return !servico.permitidos(context.security().autoridades()).isEmpty();
        }

        @Override
        public String progressLabel(JsonNode arguments) {
            return "Preparando a aprovação";
        }

        @Override
        public JsonNode displayArguments(JsonNode arguments) {
            ObjectNode exibicao = JsonNodeFactory.instance.objectNode();
            JsonNode itens = arguments == null ? null : arguments.get("itens");
            if (itens != null && itens.isArray()) {
                List<String> solicitacoes = new ArrayList<>();
                itens.forEach(i -> solicitacoes.add(i.path("tipo").asText("?") + " " + i.path("numero").asText("?")
                        + " " + i.path("decisao").asText("aprovar")));
                exibicao.put("solicitacoes", String.join(", ", solicitacoes));
            }
            if (arguments != null && arguments.hasNonNull("codigo_confirmacao")) exibicao.put("confirmacao", true);
            return exibicao;
        }

        @Override
        public PreviaAcao preparar(JsonNode argumentos, SemanticQueryContext seguranca) {
            return servico.preparar(argumentos, seguranca);
        }

        @Override
        public PreviaAcao revisar(JsonNode argumentos, JsonNode alteracoes, SemanticQueryContext seguranca) {
            return servico.revisar(argumentos, alteracoes, seguranca);
        }

        @Override
        public ResultadoAcao confirmar(JsonNode argumentos, JsonNode alteracoes, SemanticQueryContext seguranca) {
            return servico.confirmar(argumentos, alteracoes, seguranca);
        }

        @Override
        public ToolResult execute(JsonNode arguments, ToolContext context) {
            PreviaAcao previa = preparar(arguments, context.security());
            String codigo = servico.codigoConfirmacao(previa, context.security());
            String informado = ToolArgs.text(arguments, "codigo_confirmacao");
            if (informado == null || !previa.pronta() || !codigo.equalsIgnoreCase(informado.strip())) {
                ObjectNode conteudo = (ObjectNode) lerJson(previa.paraModelo());
                if (previa.pronta()) {
                    conteudo.put("codigo_confirmacao", codigo);
                    conteudo.put("orientacao", (informado == null ? "" : "O codigo nao confere com esta lista (algo mudou). ")
                            + "NADA foi decidido. Mostre ao usuario a lista de serao_decididas (tipo e numero, fornecedor, "
                            + "valor e decisao) e a de fora_da_decisao com o motivo, e pergunte se confirma. So depois do sim, "
                            + "chame decidir_solicitacoes de novo com os mesmos itens e codigo_confirmacao=" + codigo + ".");
                } else {
                    conteudo.put("orientacao", "NADA foi decidido. Explique ao usuario o que falta ou o que nao confere e "
                            + "chame de novo com os itens corrigidos.");
                }
                return ToolResult.of(conteudo.toString(), previa.resumo() + " · aguardando confirmação");
            }
            ResultadoAcao resultado = confirmar(previa.argumentos(), null, context.security());
            if (resultado.pendente()) {
                return ToolResult.of(resultado.previa().paraModelo(), resultado.previa().resumo()).asFailure();
            }
            ObjectNode conteudo = resultado.resultado().deepCopy();
            conteudo.put("historico", resultado.paraModelo());
            conteudo.put("orientacao", "Informe ao usuario exatamente quais solicitacoes foram aprovadas ou rejeitadas "
                    + "(tipo e numero, fornecedor, valor) e quais nao foram decididas, com o motivo.");
            ToolResult saida = ToolResult.of(conteudo.toString(), conteudo.path("decididas").asInt() + " decidida(s)");
            return resultado.sucesso() ? saida : saida.asFailure();
        }

        private static JsonNode lerJson(String texto) {
            try {
                return new ObjectMapper().readTree(texto);
            } catch (Exception exception) {
                return JsonNodeFactory.instance.objectNode().put("previa", texto);
            }
        }
    }
}
