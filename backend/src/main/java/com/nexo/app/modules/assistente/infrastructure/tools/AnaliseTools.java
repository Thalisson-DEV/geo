package com.nexo.app.modules.assistente.infrastructure.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.nexo.app.modules.assistente.application.AssistenteProperties;
import com.nexo.app.modules.assistente.application.agent.*;
import com.nexo.app.modules.assistente.application.results.ResultFormatter;
import com.nexo.app.modules.assistente.application.results.ResultStore;
import com.nexo.app.modules.assistente.application.results.TabularData;
import com.nexo.app.modules.assistente.application.results.TabularOps;
import com.nexo.app.modules.assistente.domain.ResultadoAssistente;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.*;

/**
 * Analises deterministicas sobre resultados ja registrados (rN): agregacoes, series temporais,
 * estatisticas, conciliacao entre fontes (ex.: planilha x GEO) e deteccao de anomalias.
 */
@Configuration(proxyBeanMethods = false)
public class AnaliseTools {

    @Bean
    AgentTool analisarResultadoTool(ResultStore store, ResultFormatter formatter, AssistenteProperties properties) {
        return new BaseTool("analisar_resultado", "Analisar resultado",
                "Analisa um resultado ja registrado na conversa (r1, r2...) sem nova consulta: 'estatisticas' "
                        + "(resumo de cada coluna), 'agrupar' (dimensoes + metrica + agregacao), 'serie_temporal' "
                        + "(coluna_data + granularidade dia/semana/mes/ano) e 'filtrar' (coluna contem valor). "
                        + "Gera um novo resultado reutilizavel.",
                JsonSchemas.object()
                        .required("resultado", JsonSchemas.string("Codigo do resultado, ex.: r2"))
                        .required("operacao", JsonSchemas.enumString(null, List.of("estatisticas", "agrupar",
                                "serie_temporal", "filtrar")))
                        .prop("dimensoes", JsonSchemas.arrayOfStrings("Colunas de agrupamento (agrupar)"))
                        .prop("metrica", JsonSchemas.string("Coluna numerica agregada (omitir para contar linhas)"))
                        .prop("agregacao", JsonSchemas.enumString(null, List.of("soma", "media", "contagem", "minimo",
                                "maximo", "mediana")))
                        .prop("coluna_data", JsonSchemas.string("Coluna de data (serie_temporal)"))
                        .prop("granularidade", JsonSchemas.enumString(null, List.of("dia", "semana", "mes", "ano")))
                        .prop("dimensao_serie", JsonSchemas.string("Dimensao adicional na serie (opcional)"))
                        .prop("coluna", JsonSchemas.string("Coluna do filtro (filtrar)"))
                        .prop("valor", JsonSchemas.string("Valor contido (filtrar)"))
                        .prop("titulo", JsonSchemas.string(null))
                        .build(),
                ToolKind.ANALYSIS, Set.of(), Duration.ofSeconds(30)) {
            @Override
            public String progressLabel(JsonNode arguments) {
                return "Analisando " + Objects.toString(ToolArgs.text(arguments, "resultado"), "resultado");
            }

            @Override
            public ToolResult execute(JsonNode arguments, ToolContext context) {
                ResultStore.StoredResult origem = store.exigir(context.conversaId(), ToolArgs.requiredText(arguments, "resultado"));
                String operacao = ToolArgs.requiredText(arguments, "operacao");
                TabularData saida = switch (operacao) {
                    case "estatisticas" -> TabularOps.estatisticas(origem.data());
                    case "agrupar" -> TabularOps.agrupar(origem.data(), ToolArgs.texts(arguments, "dimensoes"),
                            ToolArgs.text(arguments, "metrica"), ToolArgs.text(arguments, "agregacao"));
                    case "serie_temporal" -> TabularOps.serieTemporal(origem.data(),
                            ToolArgs.requiredText(arguments, "coluna_data"), ToolArgs.text(arguments, "granularidade"),
                            ToolArgs.text(arguments, "metrica"), ToolArgs.text(arguments, "agregacao"),
                            ToolArgs.text(arguments, "dimensao_serie"));
                    case "filtrar" -> TabularOps.filtrar(origem.data(), ToolArgs.requiredText(arguments, "coluna"),
                            ToolArgs.requiredText(arguments, "valor"));
                    default -> throw new ToolException("Operacao invalida: " + operacao);
                };
                String titulo = Optional.ofNullable(ToolArgs.text(arguments, "titulo"))
                        .orElse(origem.titulo() + " (" + operacao + ")");
                if (origem.data().truncated()) titulo = titulo + " [base truncada]";
                ResultStore.StoredResult novo = store.registrar(context.run(), name(), ResultadoAssistente.Natureza.CALCULO,
                        titulo, saida, Map.of("origem", origem.codigo(), "operacao", operacao));
                Map<String, Object> extra = new LinkedHashMap<>();
                extra.put("resultado_origem", origem.codigo());
                if (origem.data().truncated()) {
                    extra.put("aviso", "O resultado de origem estava truncado; a analise considera apenas as linhas salvas.");
                }
                return formatter.toToolResult(novo, properties.getAgent().getToolResultMaxChars(), extra, null);
            }
        };
    }

    @Bean
    AgentTool compararResultadosTool(ResultStore store, ResultFormatter formatter, AssistenteProperties properties) {
        return new BaseTool("comparar_resultados", "Conciliar resultados",
                "Concilia dois resultados pela chave (ex.: planilha enviada x movimentacoes do GEO): aponta linhas que "
                        + "CONFEREM, DIVERGENTES (diferenca acima da tolerancia) e presentes SOMENTE em um dos lados. "
                        + "Chaves sao comparadas sem diferenciar maiusculas, acentos e espacos. Linhas repetidas da mesma "
                        + "chave sao somadas antes da comparacao.",
                JsonSchemas.object()
                        .required("resultado_a", JsonSchemas.string("Codigo do primeiro resultado"))
                        .required("chave_a", JsonSchemas.string("Coluna chave no resultado A"))
                        .required("metricas_a", JsonSchemas.arrayOfStrings("Colunas numericas comparadas em A"))
                        .required("resultado_b", JsonSchemas.string("Codigo do segundo resultado"))
                        .prop("chave_b", JsonSchemas.string("Coluna chave em B (padrao: mesma de A)"))
                        .prop("metricas_b", JsonSchemas.arrayOfStrings("Colunas equivalentes em B (mesma ordem)"))
                        .prop("rotulo_a", JsonSchemas.string("Nome curto do lado A, ex.: planilha"))
                        .prop("rotulo_b", JsonSchemas.string("Nome curto do lado B, ex.: ces"))
                        .prop("tolerancia", JsonSchemas.number("Diferenca absoluta tolerada (padrao 0)"))
                        .prop("titulo", JsonSchemas.string(null))
                        .build(),
                ToolKind.ANALYSIS, Set.of(), Duration.ofSeconds(30)) {
            @Override
            public String progressLabel(JsonNode arguments) {
                return "Conciliando " + Objects.toString(ToolArgs.text(arguments, "resultado_a"), "A") + " com "
                        + Objects.toString(ToolArgs.text(arguments, "resultado_b"), "B");
            }

            @Override
            public ToolResult execute(JsonNode arguments, ToolContext context) {
                ResultStore.StoredResult a = store.exigir(context.conversaId(), ToolArgs.requiredText(arguments, "resultado_a"));
                ResultStore.StoredResult b = store.exigir(context.conversaId(), ToolArgs.requiredText(arguments, "resultado_b"));
                String rotuloA = rotulo(ToolArgs.text(arguments, "rotulo_a"), "a");
                String rotuloB = rotulo(ToolArgs.text(arguments, "rotulo_b"), "b");
                Double tolerancia = ToolArgs.number(arguments, "tolerancia");
                TabularData conciliado = TabularOps.conciliar(a.data(), ToolArgs.requiredText(arguments, "chave_a"),
                        ToolArgs.texts(arguments, "metricas_a"), b.data(), ToolArgs.text(arguments, "chave_b"),
                        ToolArgs.texts(arguments, "metricas_b"), rotuloA, rotuloB, tolerancia == null ? 0 : tolerancia);
                Map<String, Long> contagem = new LinkedHashMap<>();
                conciliado.rows().forEach(row -> contagem.merge(String.valueOf(row.get(1)), 1L, Long::sum));
                String titulo = Optional.ofNullable(ToolArgs.text(arguments, "titulo"))
                        .orElse("Conciliacao " + a.codigo() + " x " + b.codigo());
                ResultStore.StoredResult novo = store.registrar(context.run(), name(), ResultadoAssistente.Natureza.CALCULO,
                        titulo, conciliado, Map.of("a", a.codigo(), "b", b.codigo()));
                Map<String, Object> extra = new LinkedHashMap<>();
                extra.put("resumo_situacoes", contagem);
                if (a.data().truncated() || b.data().truncated()) {
                    extra.put("aviso", "Um dos resultados estava truncado; itens podem aparecer como ausentes por isso.");
                }
                return formatter.toToolResult(novo, properties.getAgent().getToolResultMaxChars(), extra,
                        contagem.getOrDefault("DIVERGENTE", 0L) + " divergencias");
            }
        };
    }

    @Bean
    AgentTool detectarAnomaliasTool(ResultStore store, ResultFormatter formatter, AssistenteProperties properties) {
        return new BaseTool("detectar_anomalias", "Detectar anomalias",
                "Aponta os registros de um resultado que fogem do tipico. Com 'grupos', compara cada registro com os "
                        + "seus pares (ex.: valor da nota x notas do mesmo tipo de servico; quantidade pedida x pedidos da "
                        + "mesma equipe ou material; duracao do turno x turnos da mesma base) e devolve o tipico do grupo, "
                        + "quantas vezes o registro esta acima, o percentil e o motivo em texto, pronto para "
                        + "exportar_planilha. Metodos: 'multiplo' (a partir de N vezes a mediana do grupo, padrao 2.5; o "
                        + "mais facil de explicar), 'iqr' (Tukey, padrao 1.5) e 'zscore' (padrao 2.5). Sem 'grupos', "
                        + "compara com o resultado inteiro. Traga antes a base completa, uma linha por registro: a "
                        + "mediana de uma amostra cortada engana.",
                JsonSchemas.object()
                        .required("resultado", JsonSchemas.string("Codigo do resultado"))
                        .required("metrica", JsonSchemas.string("Coluna numerica analisada (ex.: valor_total_faturado)"))
                        .prop("grupos", JsonSchemas.arrayOfStrings(
                                "Colunas que definem os pares de comparacao (ex.: [\"tipo_servico\"] ou [\"equipe\", \"material\"])"))
                        .prop("metodo", JsonSchemas.enumString(null, List.of("multiplo", "iqr", "zscore")))
                        .prop("limite", JsonSchemas.number(
                                "Corte do metodo: vezes a mediana (multiplo), multiplicador do IQR ou |z|. Use o que o usuario pedir"))
                        .prop("minimo_grupo", JsonSchemas.number("Minimo de registros para o grupo ter tipico confiavel (padrao 5)"))
                        .prop("incluir_abaixo", JsonSchemas.bool("Tambem apontar registros muito abaixo do tipico (padrao false)"))
                        .prop("limite_z", JsonSchemas.number("Obsoleto: use 'limite'"))
                        .prop("titulo", JsonSchemas.string(null))
                        .build(),
                ToolKind.ANALYSIS, Set.of(), Duration.ofSeconds(30)) {
            @Override
            public String progressLabel(JsonNode arguments) {
                return "Procurando comportamentos anormais";
            }

            @Override
            public ToolResult execute(JsonNode arguments, ToolContext context) {
                ResultStore.StoredResult origem = store.exigir(context.conversaId(), ToolArgs.requiredText(arguments, "resultado"));
                String metrica = ToolArgs.requiredText(arguments, "metrica");
                List<String> grupos = ToolArgs.texts(arguments, "grupos");
                String metodo = ToolArgs.text(arguments, "metodo");
                Double limite = Optional.ofNullable(ToolArgs.number(arguments, "limite"))
                        .orElse(ToolArgs.number(arguments, "limite_z"));
                if (grupos.isEmpty() && !"multiplo".equalsIgnoreCase(Objects.toString(metodo, ""))) {
                    String metodoGeral = Optional.ofNullable(metodo).orElse("iqr");
                    TabularData anomalias = TabularOps.anomalias(origem.data(), metrica, metodoGeral, limite == null ? 2.5 : limite);
                    String titulo = Optional.ofNullable(ToolArgs.text(arguments, "titulo"))
                            .orElse("Anomalias em " + metrica + " (" + origem.codigo() + ")");
                    ResultStore.StoredResult novo = store.registrar(context.run(), name(), ResultadoAssistente.Natureza.CALCULO,
                            titulo, anomalias, Map.of("origem", origem.codigo(), "metodo", metodoGeral));
                    Map<String, Object> extra = new LinkedHashMap<>();
                    extra.put("distribuicao", TabularOps.resumoDistribuicao(origem.data(), metrica));
                    extra.put("metodo", metodoGeral);
                    extra.putAll(avisoBaseCortada(origem));
                    return formatter.toToolResult(novo, properties.getAgent().getToolResultMaxChars(), extra,
                            anomalias.totalRows() + " anomalias");
                }
                Integer minimo = ToolArgs.integer(arguments, "minimo_grupo");
                TabularOps.AnomaliasPorGrupo analise = TabularOps.anomaliasPorGrupo(origem.data(), metrica, grupos, metodo,
                        limite, minimo == null ? 5 : minimo, ToolArgs.bool(arguments, "incluir_abaixo", false));
                String titulo = Optional.ofNullable(ToolArgs.text(arguments, "titulo"))
                        .orElse("Atipicos em " + metrica + (grupos.isEmpty() ? "" : " por " + String.join(", ", grupos)));
                Map<String, Object> consulta = new LinkedHashMap<>();
                consulta.put("origem", origem.codigo());
                consulta.put("metodo", analise.metodo());
                consulta.put("limite", analise.limite());
                consulta.put("grupos", grupos);
                ResultStore.StoredResult novo = store.registrar(context.run(), name(), ResultadoAssistente.Natureza.CALCULO,
                        titulo, analise.dados(), consulta);
                Map<String, Object> extra = new LinkedHashMap<>();
                extra.put("metodo", analise.metodo());
                extra.put("limite", analise.limite());
                extra.put("grupos_avaliados", analise.gruposAvaliados());
                if (analise.gruposIgnorados() > 0) extra.put("grupos_sem_pares_suficientes", analise.gruposIgnorados());
                extra.put("registros_analisados", origem.data().rows().size());
                extra.putAll(avisoBaseCortada(origem));
                return formatter.toToolResult(novo, properties.getAgent().getToolResultMaxChars(), extra,
                        analise.dados().totalRows() + " fora do típico");
            }
        };
    }

    @Bean
    AgentTool detectarItensIncomunsTool(ResultStore store, ResultFormatter formatter, AssistenteProperties properties) {
        return new BaseTool("detectar_itens_incomuns", "Detectar itens incomuns",
                "Avalia a composicao dos registros. Recebe um resultado com UMA LINHA POR ITEM de cada registro (ex.: "
                        + "nota + tipo de servico + acao; solicitacao + equipe + material; turno + base + atividade) e "
                        + "aponta, por registro, os itens raros no seu grupo (presentes em menos de 'frequencia_maxima' "
                        + "dos registros do grupo, padrao 10%), os itens repetidos de forma incomum e a quantidade de "
                        + "itens acima do tipico do grupo. Devolve um registro por linha com o detalhe e o motivo, pronto "
                        + "para exportar_planilha ou para cruzar com o resultado de detectar_anomalias.",
                JsonSchemas.object()
                        .required("resultado", JsonSchemas.string("Codigo do resultado com uma linha por item"))
                        .required("registro", JsonSchemas.string("Coluna que identifica o registro (ex.: execucao_id)"))
                        .required("item", JsonSchemas.string("Coluna do item (ex.: acao)"))
                        .prop("grupos", JsonSchemas.arrayOfStrings("Colunas que definem os pares (ex.: [\"tipo_servico\"])"))
                        .prop("frequencia_maxima", JsonSchemas.number("Item e incomum abaixo desta fracao do grupo (padrao 0.10)"))
                        .prop("multiplo_itens", JsonSchemas.number("Itens demais a partir de N vezes o tipico do grupo (padrao 2)"))
                        .prop("minimo_grupo", JsonSchemas.number("Minimo de registros no grupo (padrao 10)"))
                        .prop("titulo", JsonSchemas.string(null))
                        .build(),
                ToolKind.ANALYSIS, Set.of(), Duration.ofSeconds(30)) {
            @Override
            public String progressLabel(JsonNode arguments) {
                return "Avaliando a composição dos registros";
            }

            @Override
            public ToolResult execute(JsonNode arguments, ToolContext context) {
                ResultStore.StoredResult origem = store.exigir(context.conversaId(), ToolArgs.requiredText(arguments, "resultado"));
                List<String> grupos = ToolArgs.texts(arguments, "grupos");
                Double frequencia = ToolArgs.number(arguments, "frequencia_maxima");
                Double multiplo = ToolArgs.number(arguments, "multiplo_itens");
                Integer minimo = ToolArgs.integer(arguments, "minimo_grupo");
                TabularOps.ComposicaoIncomum analise = TabularOps.composicaoIncomum(origem.data(),
                        ToolArgs.requiredText(arguments, "registro"), grupos, ToolArgs.requiredText(arguments, "item"),
                        frequencia == null ? 0.10 : frequencia, minimo == null ? 10 : minimo, multiplo == null ? 2 : multiplo);
                String titulo = Optional.ofNullable(ToolArgs.text(arguments, "titulo"))
                        .orElse("Composicao incomum" + (grupos.isEmpty() ? "" : " por " + String.join(", ", grupos)));
                Map<String, Object> consulta = new LinkedHashMap<>();
                consulta.put("origem", origem.codigo());
                consulta.put("grupos", grupos);
                consulta.put("frequencia_maxima", analise.frequenciaMaxima());
                ResultStore.StoredResult novo = store.registrar(context.run(), name(), ResultadoAssistente.Natureza.CALCULO,
                        titulo, analise.dados(), consulta);
                Map<String, Object> extra = new LinkedHashMap<>();
                extra.put("registros_avaliados", analise.registrosAvaliados());
                extra.put("grupos_avaliados", analise.gruposAvaliados());
                if (analise.gruposIgnorados() > 0) extra.put("grupos_sem_pares_suficientes", analise.gruposIgnorados());
                extra.put("frequencia_maxima", analise.frequenciaMaxima());
                extra.put("multiplo_itens", analise.multiploItens());
                extra.putAll(avisoBaseCortada(origem));
                return formatter.toToolResult(novo, properties.getAgent().getToolResultMaxChars(), extra,
                        analise.dados().totalRows() + " com composição incomum");
            }
        };
    }

    /** O tipico do grupo so vale com a base inteira: avisa o modelo quando o resultado de origem foi cortado. */
    private static Map<String, Object> avisoBaseCortada(ResultStore.StoredResult origem) {
        TabularData data = origem.data();
        if (!data.truncated() && data.rows().size() >= data.totalRows()) return Map.of();
        return Map.of("aviso_base_cortada", origem.codigo() + " tem " + data.rows().size() + " de " + data.totalRows()
                + " linhas: o tipico foi calculado sobre a parte disponivel. Filtre o periodo ou a base na consulta "
                + "para trazer a populacao inteira e repita.");
    }

    private static String rotulo(String valor, String padrao) {
        String base = valor == null || valor.isBlank() ? padrao : valor;
        String normalizado = TabularOps.normalizar(base).replaceAll("[^a-z0-9]+", "_").replaceAll("^_|_$", "");
        return normalizado.isBlank() ? padrao : normalizado;
    }
}
