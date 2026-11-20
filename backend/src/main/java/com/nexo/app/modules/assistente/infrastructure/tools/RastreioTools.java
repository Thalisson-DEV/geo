package com.nexo.app.modules.assistente.infrastructure.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.nexo.app.modules.assistente.application.AssistenteProperties;
import com.nexo.app.modules.assistente.application.agent.AgentRunContext;
import com.nexo.app.modules.assistente.application.agent.AgentTool;
import com.nexo.app.modules.assistente.application.agent.BaseTool;
import com.nexo.app.modules.assistente.application.agent.JsonSchemas;
import com.nexo.app.modules.assistente.application.agent.ToolArgs;
import com.nexo.app.modules.assistente.application.agent.ToolContext;
import com.nexo.app.modules.assistente.application.agent.ToolException;
import com.nexo.app.modules.assistente.application.agent.ToolKind;
import com.nexo.app.modules.assistente.application.agent.ToolResult;
import com.nexo.app.modules.assistente.application.rastreio.LocalizadorSeries;
import com.nexo.app.modules.assistente.application.rastreio.SerieEncontrada;
import com.nexo.app.modules.assistente.application.results.ResultFormatter;
import com.nexo.app.modules.assistente.application.results.ResultStore;
import com.nexo.app.modules.assistente.application.results.TabularData;
import com.nexo.app.modules.assistente.application.results.TabularData.Column;
import com.nexo.app.modules.assistente.application.results.TabularData.ColumnType;
import com.nexo.app.modules.assistente.domain.ResultadoAssistente;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Rastreio de numeros de serie: em quais notas um medidor (ou outro material serializado) foi aplicado ou retirado.
 * O numero da nota e guardado cifrado e nao aparece nas fontes de dados; por isso a busca passa pelo modulo de
 * execucao. Vale no chat e nas IAs conectadas pelo MCP.
 */
@Configuration(proxyBeanMethods = false)
public class RastreioTools {

    static final int MAXIMO_SERIES = 200;

    private static final List<Column> COLUNAS = List.of(
            new Column("numero_serie_pedido", ColumnType.TEXTO),
            new Column("numero_serie", ColumnType.TEXTO),
            new Column("correspondencia", ColumnType.TEXTO),
            new Column("nota", ColumnType.TEXTO),
            new Column("tipo_nota", ColumnType.TEXTO),
            new Column("aguardando_numero_oficial", ColumnType.BOOLEANO),
            new Column("data_lancamento", ColumnType.DATA_HORA),
            new Column("operacao", ColumnType.TEXTO),
            new Column("material_codigo", ColumnType.TEXTO),
            new Column("material", ColumnType.TEXTO),
            new Column("origem_material", ColumnType.TEXTO),
            new Column("equipe", ColumnType.TEXTO),
            new Column("base_operacional", ColumnType.TEXTO),
            new Column("status_nota", ColumnType.TEXTO));

    @Bean
    AgentTool notasPorNumeroSerieTool(List<LocalizadorSeries> localizadores, ResultStore resultStore,
            ResultFormatter formatter, AssistenteProperties properties) {
        return new BaseTool("notas_por_numero_serie", "Notas por número de série",
                "Diz em quais notas de campo cada numero de serie (ex.: medidor) foi APLICADO ou RETIRADO, com o numero "
                        + "da nota, data, equipe, base e material. Use sempre que perguntarem em que nota/OS uma serie foi "
                        + "aplicada, instalada, retirada ou usada, ou o historico de uma serie. Aceita varias series de uma "
                        + "vez (ate " + MAXIMO_SERIES + "). A busca por serie so existe aqui: as fontes de dados nao tem o "
                        + "numero de serie.",
                JsonSchemas.object()
                        .required("series", JsonSchemas.arrayOfStrings("Numeros de serie exatamente como o usuario informou"))
                        .prop("titulo", JsonSchemas.string("Titulo curto do resultado"))
                        .build(),
                ToolKind.DATA, Set.of(), Duration.ofSeconds(40)) {
            @Override
            public Set<String> requiredAuthorities() {
                Set<String> todas = new HashSet<>();
                localizadores.forEach(l -> todas.addAll(l.autoridades()));
                return todas;
            }

            @Override
            public boolean isAvailable(AgentRunContext context) {
                return !localizadores.isEmpty();
            }

            @Override
            public String progressLabel(JsonNode arguments) {
                int total = ToolArgs.texts(arguments, "series").size();
                return total == 1 ? "Procurando a nota do número de série" : "Procurando as notas dos números de série";
            }

            @Override
            public ToolResult execute(JsonNode arguments, ToolContext context) {
                List<String> pedidas = pedidas(ToolArgs.texts(arguments, "series"));
                if (pedidas.isEmpty()) throw new ToolException("Informe ao menos um numero de serie em 'series'.");
                if (pedidas.size() > MAXIMO_SERIES) {
                    throw new ToolException("Informe no maximo " + MAXIMO_SERIES + " numeros de serie por vez.");
                }

                List<SerieEncontrada> encontradas = new ArrayList<>();
                for (LocalizadorSeries localizador : localizadores) {
                    if (localizador.autoridades().stream().anyMatch(context.security()::possuiAutoridade)) {
                        encontradas.addAll(localizador.localizar(pedidas));
                    }
                }
                // Na ordem em que o usuario pediu; dentro de cada serie, da nota mais recente para a mais antiga.
                List<String> ordem = pedidas.stream().map(p -> p.toUpperCase(Locale.ROOT)).toList();
                encontradas.sort(java.util.Comparator.comparingInt(
                        s -> ordem.indexOf(s.serieInformada().trim().toUpperCase(Locale.ROOT))));
                TabularData dados = tabela(encontradas);
                String titulo = ToolArgs.text(arguments, "titulo");
                ResultStore.StoredResult stored = resultStore.registrar(context.run(), name(),
                        ResultadoAssistente.Natureza.INTERNO,
                        titulo == null || titulo.isBlank() ? "Notas por número de série" : titulo, dados,
                        Map.of("series", pedidas));

                Map<String, Object> extra = new LinkedHashMap<>();
                extra.put("series_pedidas", pedidas.size());
                List<String> semLancamento = semLancamento(pedidas, encontradas);
                extra.put("series_sem_lancamento", semLancamento);
                List<String> porTrecho = encontradas.stream().filter(s -> !s.exata())
                        .map(SerieEncontrada::serieInformada).distinct().toList();
                if (!porTrecho.isEmpty()) extra.put("series_achadas_so_por_trecho", porTrecho);
                extra.put("orientacao", "Para cada serie, cite a nota, a data, a operacao (aplicado ou retirado) e a equipe. "
                        + "Uma serie pode aparecer em mais de uma nota (ex.: aplicada numa e retirada noutra): mostre todas, "
                        + "da mais recente para a mais antiga. Linhas com correspondencia 'por trecho' NAO sao a serie "
                        + "exata: avise que a serie informada nao foi lancada exatamente assim e mostre as parecidas. "
                        + "Nota avulsa aguardando numero oficial traz o numero provisorio; diga isso. Em ocorrencia, o "
                        + "numero e o da ocorrencia comercial. Liste as series sem lancamento.");
                int achadas = pedidas.size() - semLancamento.size();
                return formatter.toToolResult(stored, properties.getAgent().getToolResultMaxChars(), extra,
                        achadas + " de " + pedidas.size() + (pedidas.size() == 1 ? " série" : " séries") + " com nota");
            }
        };
    }

    /** Series sem repetir, na ordem pedida, sem diferenciar maiusculas nem espacos nas pontas. */
    static List<String> pedidas(List<String> series) {
        Map<String, String> unicas = new LinkedHashMap<>();
        for (String serie : series) {
            if (serie == null || serie.isBlank()) continue;
            unicas.putIfAbsent(serie.trim().toUpperCase(Locale.ROOT), serie.trim());
        }
        return List.copyOf(unicas.values());
    }

    static List<String> semLancamento(List<String> pedidas, List<SerieEncontrada> encontradas) {
        Set<String> achadas = new LinkedHashSet<>();
        encontradas.forEach(s -> achadas.add(s.serieInformada().trim().toUpperCase(Locale.ROOT)));
        return pedidas.stream().filter(p -> !achadas.contains(p.toUpperCase(Locale.ROOT))).toList();
    }

    static TabularData tabela(List<SerieEncontrada> encontradas) {
        List<List<Object>> linhas = new ArrayList<>();
        for (SerieEncontrada s : encontradas) {
            List<Object> linha = new ArrayList<>();
            linha.add(s.serieInformada());
            linha.add(s.numeroSerie());
            linha.add(s.exata() ? "exata" : "por trecho");
            linha.add(s.nota());
            linha.add(s.tipoNota());
            linha.add(s.aguardandoNumeroOficial());
            linha.add(TabularData.normalize(s.dataLancamento()));
            linha.add(s.operacao());
            linha.add(s.materialCodigo());
            linha.add(s.material());
            linha.add(s.origem());
            linha.add(s.equipe());
            linha.add(s.baseOperacional());
            linha.add(s.statusNota());
            linhas.add(linha);
        }
        return new TabularData(COLUNAS, linhas, linhas.size(), false);
    }
}
