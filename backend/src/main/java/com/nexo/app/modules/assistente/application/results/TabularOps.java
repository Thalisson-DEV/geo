package com.nexo.app.modules.assistente.application.results;

import com.nexo.app.modules.assistente.application.agent.ToolException;

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.IsoFields;
import java.util.*;

/**
 * Operacoes analiticas deterministicas sobre resultados tabulares (agrupar, estatisticas, series,
 * conciliacao entre fontes e deteccao de anomalias). Garante analise confiavel mesmo sem o sandbox Python.
 */
public final class TabularOps {

    private TabularOps() {
    }

    public static TabularData agrupar(TabularData data, List<String> dimensoes, String metrica, String agregacao) {
        List<Integer> indicesDimensao = dimensoes.stream().map(nome -> exigirColuna(data, nome)).toList();
        int indiceMetrica = metrica == null || metrica.isBlank() ? -1 : exigirColuna(data, metrica);
        String funcao = agregacao == null ? (indiceMetrica < 0 ? "contagem" : "soma") : agregacao.toLowerCase(Locale.ROOT);
        Map<List<Object>, List<Double>> grupos = new LinkedHashMap<>();
        for (List<Object> row : data.rows()) {
            List<Object> chave = new ArrayList<>();
            for (int indice : indicesDimensao) chave.add(row.get(indice));
            List<Double> valores = grupos.computeIfAbsent(chave, ignored -> new ArrayList<>());
            if (indiceMetrica < 0) valores.add(1.0);
            else {
                Double valor = numero(row.get(indiceMetrica));
                if (valor != null) valores.add(valor);
            }
        }
        List<TabularData.Column> colunas = new ArrayList<>();
        for (int indice : indicesDimensao) colunas.add(data.columns().get(indice));
        String nomeMetrica = indiceMetrica < 0 ? "quantidade" : funcao + "_" + data.columns().get(indiceMetrica).name();
        colunas.add(new TabularData.Column(nomeMetrica, TabularData.ColumnType.NUMERO));
        List<List<Object>> linhas = new ArrayList<>();
        grupos.forEach((chave, valores) -> {
            List<Object> linha = new ArrayList<>(chave);
            linha.add(arredondar(agregar(valores, funcao)));
            linhas.add(linha);
        });
        linhas.sort((a, b) -> Double.compare(numeroOuZero(b.getLast()), numeroOuZero(a.getLast())));
        return new TabularData(colunas, linhas, linhas.size(), false);
    }

    public static TabularData serieTemporal(TabularData data, String colunaData, String granularidade, String metrica,
            String agregacao, String dimensao) {
        int indiceData = exigirColuna(data, colunaData);
        String gran = granularidade == null ? "mes" : granularidade.toLowerCase(Locale.ROOT);
        List<List<Object>> base = new ArrayList<>();
        List<TabularData.Column> colunas = new ArrayList<>();
        colunas.add(new TabularData.Column("periodo", TabularData.ColumnType.TEXTO));
        colunas.addAll(data.columns());
        for (List<Object> row : data.rows()) {
            String periodo = periodo(row.get(indiceData), gran);
            if (periodo == null) continue;
            List<Object> linha = new ArrayList<>();
            linha.add(periodo);
            linha.addAll(row);
            base.add(linha);
        }
        TabularData expandido = new TabularData(colunas, base, base.size(), false);
        List<String> dimensoes = dimensao == null ? List.of("periodo") : List.of("periodo", dimensao);
        TabularData agrupado = agrupar(expandido, dimensoes, metrica, agregacao);
        List<List<Object>> ordenado = new ArrayList<>(agrupado.rows());
        ordenado.sort(Comparator.comparing(row -> String.valueOf(row.getFirst())));
        return new TabularData(agrupado.columns(), ordenado, ordenado.size(), false);
    }

    public static TabularData estatisticas(TabularData data) {
        List<TabularData.Column> colunas = List.of(
                new TabularData.Column("coluna", TabularData.ColumnType.TEXTO),
                new TabularData.Column("tipo", TabularData.ColumnType.TEXTO),
                new TabularData.Column("preenchidos", TabularData.ColumnType.INTEIRO),
                new TabularData.Column("distintos", TabularData.ColumnType.INTEIRO),
                new TabularData.Column("soma", TabularData.ColumnType.NUMERO),
                new TabularData.Column("media", TabularData.ColumnType.NUMERO),
                new TabularData.Column("mediana", TabularData.ColumnType.NUMERO),
                new TabularData.Column("desvio_padrao", TabularData.ColumnType.NUMERO),
                new TabularData.Column("minimo", TabularData.ColumnType.TEXTO),
                new TabularData.Column("maximo", TabularData.ColumnType.TEXTO),
                new TabularData.Column("valores_mais_frequentes", TabularData.ColumnType.TEXTO));
        List<List<Object>> linhas = new ArrayList<>();
        for (int i = 0; i < data.columns().size(); i++) {
            TabularData.Column coluna = data.columns().get(i);
            List<Object> valores = new ArrayList<>();
            for (List<Object> row : data.rows()) if (row.get(i) != null) valores.add(row.get(i));
            Set<String> distintos = new HashSet<>();
            valores.forEach(valor -> distintos.add(String.valueOf(valor)));
            boolean numerico = coluna.type() == TabularData.ColumnType.NUMERO || coluna.type() == TabularData.ColumnType.INTEIRO;
            List<Object> linha = new ArrayList<>(Arrays.asList(new Object[11]));
            linha.set(0, coluna.name());
            linha.set(1, coluna.type().name().toLowerCase(Locale.ROOT));
            linha.set(2, valores.size());
            linha.set(3, distintos.size());
            if (numerico && !valores.isEmpty()) {
                List<Double> numeros = valores.stream().map(TabularOps::numero).filter(Objects::nonNull).sorted().toList();
                double soma = numeros.stream().mapToDouble(Double::doubleValue).sum();
                double media = soma / numeros.size();
                double variancia = numeros.stream().mapToDouble(v -> (v - media) * (v - media)).sum() / Math.max(1, numeros.size() - 1);
                linha.set(4, arredondar(soma));
                linha.set(5, arredondar(media));
                linha.set(6, arredondar(mediana(numeros)));
                linha.set(7, arredondar(Math.sqrt(variancia)));
                linha.set(8, String.valueOf(arredondar(numeros.getFirst())));
                linha.set(9, String.valueOf(arredondar(numeros.getLast())));
            } else if (!valores.isEmpty()) {
                List<String> textos = valores.stream().map(String::valueOf).sorted().toList();
                linha.set(8, textos.getFirst());
                linha.set(9, textos.getLast());
                Map<String, Integer> frequencia = new HashMap<>();
                textos.forEach(texto -> frequencia.merge(texto, 1, Integer::sum));
                linha.set(10, frequencia.entrySet().stream()
                        .sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).limit(5)
                        .map(entry -> entry.getKey() + " (" + entry.getValue() + ")").reduce((a, b) -> a + "; " + b).orElse(""));
            }
            linhas.add(linha);
        }
        return new TabularData(colunas, linhas, linhas.size(), false);
    }

    /**
     * Concilia dois resultados pela chave: linhas presentes so em A, so em B, divergentes e iguais.
     * Chaves sao comparadas sem diferenciar maiusculas, acentos e espacos extras.
     */
    public static TabularData conciliar(TabularData a, String chaveA, List<String> metricasA,
            TabularData b, String chaveB, List<String> metricasB, String rotuloA, String rotuloB, double tolerancia) {
        int indiceChaveA = exigirColuna(a, chaveA);
        int indiceChaveB = exigirColuna(b, chaveB == null ? chaveA : chaveB);
        List<Integer> indicesA = metricasA.stream().map(nome -> exigirColuna(a, nome)).toList();
        List<String> nomesB = metricasB == null || metricasB.isEmpty() ? metricasA : metricasB;
        if (nomesB.size() != indicesA.size()) throw new ToolException("Informe o mesmo numero de metricas para A e B.");
        List<Integer> indicesB = nomesB.stream().map(nome -> exigirColuna(b, nome)).toList();

        Map<String, Object[]> mapaA = indexar(a, indiceChaveA, indicesA);
        Map<String, Object[]> mapaB = indexar(b, indiceChaveB, indicesB);
        LinkedHashSet<String> chaves = new LinkedHashSet<>(mapaA.keySet());
        chaves.addAll(mapaB.keySet());

        List<TabularData.Column> colunas = new ArrayList<>();
        colunas.add(new TabularData.Column("chave", TabularData.ColumnType.TEXTO));
        colunas.add(new TabularData.Column("situacao", TabularData.ColumnType.TEXTO));
        for (int i = 0; i < indicesA.size(); i++) {
            String nome = metricasA.get(i);
            colunas.add(new TabularData.Column(nome + "_" + rotuloA, TabularData.ColumnType.NUMERO));
            colunas.add(new TabularData.Column(nome + "_" + rotuloB, TabularData.ColumnType.NUMERO));
            colunas.add(new TabularData.Column("diferenca_" + nome, TabularData.ColumnType.NUMERO));
        }
        List<List<Object>> linhas = new ArrayList<>();
        for (String chave : chaves) {
            Object[] valoresA = mapaA.get(chave);
            Object[] valoresB = mapaB.get(chave);
            String situacao;
            List<Object> metricas = new ArrayList<>();
            boolean divergente = false;
            for (int i = 0; i < indicesA.size(); i++) {
                Double va = valoresA == null ? null : numero(valoresA[i + 1]);
                Double vb = valoresB == null ? null : numero(valoresB[i + 1]);
                metricas.add(va == null ? null : arredondar(va));
                metricas.add(vb == null ? null : arredondar(vb));
                Double diferenca = va == null || vb == null ? null : vb - va;
                metricas.add(diferenca == null ? null : arredondar(diferenca));
                if (diferenca != null && Math.abs(diferenca) > tolerancia) divergente = true;
            }
            if (valoresA == null) situacao = "SOMENTE_" + rotuloB.toUpperCase(Locale.ROOT);
            else if (valoresB == null) situacao = "SOMENTE_" + rotuloA.toUpperCase(Locale.ROOT);
            else situacao = divergente ? "DIVERGENTE" : "CONFERE";
            List<Object> linha = new ArrayList<>();
            linha.add(valoresA != null ? valoresA[0] : valoresB[0]);
            linha.add(situacao);
            linha.addAll(metricas);
            linhas.add(linha);
        }
        linhas.sort(Comparator.comparing((List<Object> row) -> ordemSituacao(String.valueOf(row.get(1))))
                .thenComparing(row -> String.valueOf(row.getFirst())));
        return new TabularData(colunas, linhas, linhas.size(), false);
    }

    /** Anomalias por IQR (Tukey, k=1.5) ou z-score (|z| >= limite). */
    public static TabularData anomalias(TabularData data, String metrica, String metodo, double limiteZ) {
        int indice = exigirColuna(data, metrica);
        List<Double> valores = new ArrayList<>();
        for (List<Object> row : data.rows()) {
            Double valor = numero(row.get(indice));
            if (valor != null) valores.add(valor);
        }
        if (valores.size() < 4) throw new ToolException("Sao necessarios ao menos 4 valores numericos para detectar anomalias.");
        List<Double> ordenados = new ArrayList<>(valores);
        Collections.sort(ordenados);
        double media = valores.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        double desvio = Math.sqrt(valores.stream().mapToDouble(v -> (v - media) * (v - media)).sum() / Math.max(1, valores.size() - 1));
        double q1 = quantil(ordenados, 0.25);
        double q3 = quantil(ordenados, 0.75);
        double iqr = q3 - q1;
        double inferior = q1 - 1.5 * iqr;
        double superior = q3 + 1.5 * iqr;
        boolean usarZ = "zscore".equalsIgnoreCase(metodo);

        List<TabularData.Column> colunas = new ArrayList<>(data.columns());
        colunas.add(new TabularData.Column("zscore", TabularData.ColumnType.NUMERO));
        colunas.add(new TabularData.Column("anomalia", TabularData.ColumnType.TEXTO));
        List<List<Object>> linhas = new ArrayList<>();
        for (List<Object> row : data.rows()) {
            Double valor = numero(row.get(indice));
            if (valor == null) continue;
            double z = desvio == 0 ? 0 : (valor - media) / desvio;
            String tipo = null;
            if (usarZ ? Math.abs(z) >= limiteZ : valor > superior) tipo = valor > media ? "ACIMA_DO_ESPERADO" : "ABAIXO_DO_ESPERADO";
            if (!usarZ && valor < inferior) tipo = "ABAIXO_DO_ESPERADO";
            if (tipo == null) continue;
            List<Object> linha = new ArrayList<>(row);
            linha.add(arredondar(z));
            linha.add(tipo);
            linhas.add(linha);
        }
        linhas.sort((x, y) -> Double.compare(Math.abs(numeroOuZero(y.get(y.size() - 2))), Math.abs(numeroOuZero(x.get(x.size() - 2)))));
        return new TabularData(colunas, linhas, linhas.size(), false);
    }

    /**
     * Compara cada linha com o tipico do seu grupo (ex.: valor da nota x notas do mesmo tipo de servico,
     * quantidade pedida x pedidos da mesma equipe). Metodos: {@code multiplo} (valor a partir de N vezes a
     * mediana do grupo, padrao 2.5), {@code iqr} (acima de Q3 + N x IQR do grupo, padrao 1.5) e {@code zscore}
     * (|z| a partir de N no grupo, padrao 2.5). Grupos com menos de {@code minimoGrupo} valores ficam de fora:
     * sem pares suficientes nao ha tipico confiavel.
     */
    public static AnomaliasPorGrupo anomaliasPorGrupo(TabularData data, String metrica, List<String> grupos, String metodo,
            Double limiteInformado, int minimoGrupo, boolean incluirAbaixo) {
        int indice = exigirColuna(data, metrica);
        List<Integer> indicesGrupo = grupos.stream().map(grupo -> exigirColuna(data, grupo)).toList();
        String metodoEfetivo = metodo == null ? "multiplo" : metodo.trim().toLowerCase(Locale.ROOT);
        if (!List.of("multiplo", "iqr", "zscore").contains(metodoEfetivo)) {
            throw new ToolException("Metodo invalido: " + metodo + ". Use multiplo, iqr ou zscore.");
        }
        double limite = limiteInformado != null && limiteInformado > 0 ? limiteInformado
                : "iqr".equals(metodoEfetivo) ? 1.5 : 2.5;
        int minimo = Math.max(3, minimoGrupo);

        Map<List<Object>, List<Double>> valoresPorGrupo = new LinkedHashMap<>();
        for (List<Object> row : data.rows()) {
            Double valor = numero(row.get(indice));
            if (valor == null) continue;
            valoresPorGrupo.computeIfAbsent(chaveGrupo(row, indicesGrupo), chave -> new ArrayList<>()).add(valor);
        }
        Map<List<Object>, Distribuicao> distribuicoes = new HashMap<>();
        int gruposIgnorados = 0;
        for (Map.Entry<List<Object>, List<Double>> entrada : valoresPorGrupo.entrySet()) {
            if (entrada.getValue().size() < minimo) {
                gruposIgnorados++;
                continue;
            }
            distribuicoes.put(entrada.getKey(), Distribuicao.de(entrada.getValue()));
        }

        List<TabularData.Column> colunas = new ArrayList<>(data.columns());
        colunas.add(new TabularData.Column("tipico_grupo", TabularData.ColumnType.NUMERO));
        colunas.add(new TabularData.Column("registros_grupo", TabularData.ColumnType.INTEIRO));
        colunas.add(new TabularData.Column("vezes_o_tipico", TabularData.ColumnType.NUMERO));
        colunas.add(new TabularData.Column("percentil_no_grupo", TabularData.ColumnType.INTEIRO));
        colunas.add(new TabularData.Column("anomalia", TabularData.ColumnType.TEXTO));
        colunas.add(new TabularData.Column("motivo", TabularData.ColumnType.TEXTO));
        List<List<Object>> linhas = new ArrayList<>();
        List<Double> ordem = new ArrayList<>();
        for (List<Object> row : data.rows()) {
            Double valor = numero(row.get(indice));
            if (valor == null) continue;
            List<Object> chave = chaveGrupo(row, indicesGrupo);
            Distribuicao grupo = distribuicoes.get(chave);
            if (grupo == null) continue;
            double vezes = grupo.mediana() > 0 ? valor / grupo.mediana() : Double.NaN;
            double z = grupo.desvio() == 0 ? 0 : (valor - grupo.media()) / grupo.desvio();
            String tipo = switch (metodoEfetivo) {
                case "iqr" -> valor > grupo.q3() + limite * grupo.iqr() ? "ACIMA_DO_TIPICO"
                        : incluirAbaixo && valor < grupo.q1() - limite * grupo.iqr() ? "ABAIXO_DO_TIPICO" : null;
                case "zscore" -> z >= limite ? "ACIMA_DO_TIPICO" : incluirAbaixo && z <= -limite ? "ABAIXO_DO_TIPICO" : null;
                default -> !Double.isNaN(vezes) && vezes >= limite ? "ACIMA_DO_TIPICO"
                        : incluirAbaixo && !Double.isNaN(vezes) && vezes <= 1 / limite ? "ABAIXO_DO_TIPICO" : null;
            };
            if (tipo == null) continue;
            List<Object> linha = new ArrayList<>(row);
            linha.add(arredondar(grupo.mediana()));
            linha.add(grupo.quantidade());
            linha.add(Double.isNaN(vezes) ? null : arredondar(Math.round(vezes * 100) / 100.0));
            linha.add(grupo.percentil(valor));
            linha.add(tipo);
            linha.add(motivo(metrica, valor, vezes, grupo, descreverGrupo(grupos, chave)));
            linhas.add(linha);
            ordem.add(Double.isNaN(vezes) ? Math.abs(z) : Math.max(vezes, vezes == 0 ? 0 : 1 / vezes));
        }
        List<Integer> posicoes = new ArrayList<>();
        for (int i = 0; i < linhas.size(); i++) posicoes.add(i);
        posicoes.sort((a, b) -> Double.compare(ordem.get(b), ordem.get(a)));
        List<List<Object>> ordenadas = posicoes.stream().map(linhas::get).toList();
        return new AnomaliasPorGrupo(new TabularData(colunas, ordenadas, ordenadas.size(), false),
                distribuicoes.size(), gruposIgnorados, metodoEfetivo, limite);
    }

    /**
     * Composicao incomum: recebe uma linha por item de cada registro (ex.: nota + tipo de servico + acao;
     * solicitacao + equipe + material) e aponta, por registro, os itens raros no seu grupo (presentes em menos
     * de {@code frequenciaMaxima} dos registros do grupo), os itens repetidos de forma incomum e a quantidade
     * de itens acima do tipico do grupo.
     */
    public static ComposicaoIncomum composicaoIncomum(TabularData data, String colunaRegistro, List<String> grupos,
            String colunaItem, double frequenciaMaxima, int minimoGrupo, double multiploItens) {
        int indiceRegistro = exigirColuna(data, colunaRegistro);
        int indiceItem = exigirColuna(data, colunaItem);
        List<Integer> indicesGrupo = grupos.stream().map(grupo -> exigirColuna(data, grupo)).toList();
        double frequencia = frequenciaMaxima > 0 && frequenciaMaxima < 1 ? frequenciaMaxima : 0.10;
        double multiplo = multiploItens > 1 ? multiploItens : 2.0;
        int minimo = Math.max(5, minimoGrupo);

        // registro -> grupo e contagem de cada item
        Map<Object, List<Object>> grupoDoRegistro = new LinkedHashMap<>();
        Map<Object, Map<String, Integer>> itensDoRegistro = new LinkedHashMap<>();
        for (List<Object> row : data.rows()) {
            Object registro = row.get(indiceRegistro);
            Object item = row.get(indiceItem);
            if (registro == null || item == null) continue;
            grupoDoRegistro.putIfAbsent(registro, chaveGrupo(row, indicesGrupo));
            itensDoRegistro.computeIfAbsent(registro, chave -> new LinkedHashMap<>())
                    .merge(String.valueOf(item), 1, Integer::sum);
        }
        Map<List<Object>, Integer> registrosPorGrupo = new HashMap<>();
        Map<List<Object>, Map<String, Integer>> presencaPorGrupo = new HashMap<>();
        Map<List<Object>, Map<String, Integer>> repeticaoPorGrupo = new HashMap<>();
        Map<List<Object>, List<Double>> totaisPorGrupo = new HashMap<>();
        for (Map.Entry<Object, Map<String, Integer>> entrada : itensDoRegistro.entrySet()) {
            List<Object> grupo = grupoDoRegistro.get(entrada.getKey());
            registrosPorGrupo.merge(grupo, 1, Integer::sum);
            int total = 0;
            for (Map.Entry<String, Integer> item : entrada.getValue().entrySet()) {
                presencaPorGrupo.computeIfAbsent(grupo, chave -> new HashMap<>()).merge(item.getKey(), 1, Integer::sum);
                if (item.getValue() > 1) {
                    repeticaoPorGrupo.computeIfAbsent(grupo, chave -> new HashMap<>()).merge(item.getKey(), 1, Integer::sum);
                }
                total += item.getValue();
            }
            totaisPorGrupo.computeIfAbsent(grupo, chave -> new ArrayList<>()).add((double) total);
        }

        List<TabularData.Column> colunas = new ArrayList<>();
        colunas.add(new TabularData.Column(data.columns().get(indiceRegistro).name(), data.columns().get(indiceRegistro).type()));
        for (int indice : indicesGrupo) colunas.add(data.columns().get(indice));
        colunas.add(new TabularData.Column("itens", TabularData.ColumnType.INTEIRO));
        colunas.add(new TabularData.Column("itens_tipico_grupo", TabularData.ColumnType.NUMERO));
        colunas.add(new TabularData.Column("registros_grupo", TabularData.ColumnType.INTEIRO));
        colunas.add(new TabularData.Column("itens_incomuns", TabularData.ColumnType.INTEIRO));
        colunas.add(new TabularData.Column("detalhe_incomuns", TabularData.ColumnType.TEXTO));
        colunas.add(new TabularData.Column("motivo", TabularData.ColumnType.TEXTO));
        List<List<Object>> linhas = new ArrayList<>();
        int gruposIgnorados = (int) registrosPorGrupo.values().stream().filter(total -> total < minimo).count();
        for (Map.Entry<Object, Map<String, Integer>> entrada : itensDoRegistro.entrySet()) {
            List<Object> grupo = grupoDoRegistro.get(entrada.getKey());
            int registros = registrosPorGrupo.get(grupo);
            if (registros < minimo) continue;
            Map<String, Integer> presenca = presencaPorGrupo.getOrDefault(grupo, Map.of());
            Map<String, Integer> repeticao = repeticaoPorGrupo.getOrDefault(grupo, Map.of());
            List<String> incomuns = new ArrayList<>();
            int total = 0;
            for (Map.Entry<String, Integer> item : entrada.getValue().entrySet()) {
                total += item.getValue();
                double presente = presenca.getOrDefault(item.getKey(), 0) / (double) registros;
                if (presente < frequencia) {
                    incomuns.add(item.getKey() + " (em " + percentual(presente) + " do grupo)");
                } else if (item.getValue() > 1 && repeticao.getOrDefault(item.getKey(), 0) / (double) registros < frequencia) {
                    incomuns.add(item.getKey() + " repetido " + item.getValue() + "x (repete em "
                            + percentual(repeticao.getOrDefault(item.getKey(), 0) / (double) registros) + " do grupo)");
                }
            }
            List<Double> totais = new ArrayList<>(totaisPorGrupo.get(grupo));
            Collections.sort(totais);
            double tipico = mediana(totais);
            boolean itensDemais = tipico > 0 && total >= multiplo * tipico;
            if (incomuns.isEmpty() && !itensDemais) continue;
            List<String> motivos = new ArrayList<>();
            if (itensDemais) {
                motivos.add(total + " itens, " + formatar(total / tipico) + "x o tipico de " + formatar(tipico)
                        + " do grupo");
            }
            if (!incomuns.isEmpty()) motivos.add(incomuns.size() + (incomuns.size() == 1 ? " item incomum" : " itens incomuns"));
            List<Object> linha = new ArrayList<>();
            linha.add(entrada.getKey());
            linha.addAll(grupo);
            linha.add(total);
            linha.add(arredondar(tipico));
            linha.add(registros);
            linha.add(incomuns.size());
            linha.add(String.join("; ", incomuns));
            linha.add(String.join("; ", motivos) + " (" + descreverGrupo(grupos, grupo) + ")");
            linhas.add(linha);
        }
        int posicaoIncomuns = colunas.size() - 3;
        int posicaoItens = 1 + indicesGrupo.size();
        linhas.sort((a, b) -> {
            int porIncomuns = Integer.compare((Integer) b.get(posicaoIncomuns), (Integer) a.get(posicaoIncomuns));
            return porIncomuns != 0 ? porIncomuns : Integer.compare((Integer) b.get(posicaoItens), (Integer) a.get(posicaoItens));
        });
        return new ComposicaoIncomum(new TabularData(colunas, linhas, linhas.size(), false), itensDoRegistro.size(),
                registrosPorGrupo.size() - gruposIgnorados, gruposIgnorados, frequencia, multiplo);
    }

    public record AnomaliasPorGrupo(TabularData dados, int gruposAvaliados, int gruposIgnorados, String metodo,
            double limite) {
    }

    public record ComposicaoIncomum(TabularData dados, int registrosAvaliados, int gruposAvaliados, int gruposIgnorados,
            double frequenciaMaxima, double multiploItens) {
    }

    private record Distribuicao(int quantidade, double media, double desvio, double mediana, double q1, double q3,
            List<Double> ordenados) {

        static Distribuicao de(List<Double> valores) {
            List<Double> ordenados = new ArrayList<>(valores);
            Collections.sort(ordenados);
            double media = valores.stream().mapToDouble(Double::doubleValue).average().orElse(0);
            double desvio = Math.sqrt(valores.stream().mapToDouble(v -> (v - media) * (v - media)).sum()
                    / Math.max(1, valores.size() - 1));
            return new Distribuicao(valores.size(), media, desvio, TabularOps.mediana(ordenados), quantil(ordenados, 0.25),
                    quantil(ordenados, 0.75), ordenados);
        }

        double iqr() {
            return q3 - q1;
        }

        int percentil(double valor) {
            int abaixo = 0;
            for (double atual : ordenados) {
                if (atual < valor) abaixo++;
                else break;
            }
            return (int) Math.round(100.0 * abaixo / ordenados.size());
        }
    }

    private static List<Object> chaveGrupo(List<Object> row, List<Integer> indices) {
        List<Object> chave = new ArrayList<>(indices.size());
        for (int indice : indices) chave.add(row.get(indice));
        return chave;
    }

    private static String descreverGrupo(List<String> grupos, List<Object> chave) {
        if (grupos.isEmpty()) return "todos os registros";
        List<String> partes = new ArrayList<>();
        for (int i = 0; i < grupos.size(); i++) partes.add(grupos.get(i) + " " + Objects.toString(chave.get(i), "não informado"));
        return String.join(", ", partes);
    }

    private static String motivo(String metrica, double valor, double vezes, Distribuicao grupo, String descricaoGrupo) {
        String base = metrica + " " + formatar(valor);
        String comparacao = Double.isNaN(vezes)
                ? " com o tipico do grupo igual a zero"
                : vezes >= 1 ? ", " + formatar(vezes) + "x o tipico de " + formatar(grupo.mediana())
                : valor <= 0 ? ", abaixo do tipico de " + formatar(grupo.mediana())
                : ", " + formatar(grupo.mediana() / valor) + "x abaixo do tipico de " + formatar(grupo.mediana());
        return base + comparacao + " (" + descricaoGrupo + ", " + grupo.quantidade() + " registros)";
    }

    private static String formatar(double valor) {
        java.text.NumberFormat formato = java.text.NumberFormat.getNumberInstance(Locale.of("pt", "BR"));
        formato.setMaximumFractionDigits(2);
        formato.setMinimumFractionDigits(valor == Math.rint(valor) ? 0 : 2);
        return formato.format(valor);
    }

    private static String percentual(double fracao) {
        return formatar(Math.round(fracao * 1000) / 10.0) + "%";
    }

    public static Map<String, Object> resumoDistribuicao(TabularData data, String metrica) {
        int indice = exigirColuna(data, metrica);
        List<Double> valores = new ArrayList<>();
        for (List<Object> row : data.rows()) {
            Double valor = numero(row.get(indice));
            if (valor != null) valores.add(valor);
        }
        Collections.sort(valores);
        Map<String, Object> resumo = new LinkedHashMap<>();
        if (valores.isEmpty()) return resumo;
        double media = valores.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        resumo.put("quantidade", valores.size());
        resumo.put("media", arredondar(media));
        resumo.put("mediana", arredondar(mediana(valores)));
        resumo.put("q1", arredondar(quantil(valores, 0.25)));
        resumo.put("q3", arredondar(quantil(valores, 0.75)));
        resumo.put("minimo", arredondar(valores.getFirst()));
        resumo.put("maximo", arredondar(valores.getLast()));
        return resumo;
    }

    public static TabularData filtrar(TabularData data, String coluna, String valor) {
        int indice = exigirColuna(data, coluna);
        String alvo = normalizar(valor);
        List<List<Object>> linhas = data.rows().stream()
                .filter(row -> row.get(indice) != null && normalizar(String.valueOf(row.get(indice))).contains(alvo))
                .toList();
        return new TabularData(data.columns(), linhas, linhas.size(), false);
    }

    // --------------------------------------------------------------------------------- utilitarios

    public static int exigirColuna(TabularData data, String nome) {
        if (nome == null) throw new ToolException("Coluna nao informada.");
        int indice = data.columnIndex(nome.trim());
        if (indice < 0) {
            throw new ToolException("Coluna '" + nome + "' nao existe no resultado. Colunas: "
                    + String.join(", ", data.columns().stream().map(TabularData.Column::name).toList()));
        }
        return indice;
    }

    public static Double numero(Object valor) {
        if (valor == null) return null;
        if (valor instanceof Number number) return number.doubleValue();
        String texto = String.valueOf(valor).trim();
        if (texto.isEmpty()) return null;
        try {
            if (texto.matches("-?\\d{1,3}(\\.\\d{3})+(,\\d+)?")) texto = texto.replace(".", "").replace(",", ".");
            else if (texto.matches("-?\\d+,\\d+")) texto = texto.replace(",", ".");
            return Double.valueOf(texto);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    public static Object arredondar(double valor) {
        if (Double.isNaN(valor) || Double.isInfinite(valor)) return null;
        if (valor == Math.rint(valor) && Math.abs(valor) < 1e15) return (long) valor;
        return Math.round(valor * 10_000.0) / 10_000.0;
    }

    public static String normalizar(String texto) {
        if (texto == null) return "";
        return Normalizer.normalize(texto, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    private static Map<String, Object[]> indexar(TabularData data, int indiceChave, List<Integer> indicesMetricas) {
        Map<String, Object[]> mapa = new LinkedHashMap<>();
        for (List<Object> row : data.rows()) {
            Object chaveBruta = row.get(indiceChave);
            if (chaveBruta == null) continue;
            String chave = normalizar(String.valueOf(chaveBruta));
            if (chave.endsWith(".0")) chave = chave.substring(0, chave.length() - 2);
            Object[] existente = mapa.get(chave);
            if (existente == null) {
                Object[] valores = new Object[indicesMetricas.size() + 1];
                valores[0] = chaveBruta;
                for (int i = 0; i < indicesMetricas.size(); i++) valores[i + 1] = numero(row.get(indicesMetricas.get(i)));
                mapa.put(chave, valores);
            } else {
                for (int i = 0; i < indicesMetricas.size(); i++) {
                    Double atual = numero(existente[i + 1]);
                    Double novo = numero(row.get(indicesMetricas.get(i)));
                    existente[i + 1] = atual == null ? novo : novo == null ? atual : atual + novo;
                }
            }
        }
        return mapa;
    }

    private static int ordemSituacao(String situacao) {
        if (situacao.equals("DIVERGENTE")) return 0;
        if (situacao.startsWith("SOMENTE_")) return 1;
        return 2;
    }

    public static double agregar(List<Double> valores, String funcao) {
        if (valores.isEmpty()) return 0;
        return switch (funcao) {
            case "contagem" -> valores.size();
            case "media" -> valores.stream().mapToDouble(Double::doubleValue).average().orElse(0);
            case "minimo" -> valores.stream().mapToDouble(Double::doubleValue).min().orElse(0);
            case "maximo" -> valores.stream().mapToDouble(Double::doubleValue).max().orElse(0);
            case "mediana" -> mediana(valores.stream().sorted().toList());
            case "soma" -> valores.stream().mapToDouble(Double::doubleValue).sum();
            default -> throw new ToolException("Agregacao invalida: " + funcao + ". Use soma, media, contagem, minimo, maximo ou mediana.");
        };
    }

    private static double mediana(List<Double> ordenados) {
        return quantil(ordenados, 0.5);
    }

    private static double quantil(List<Double> ordenados, double q) {
        if (ordenados.isEmpty()) return 0;
        double posicao = (ordenados.size() - 1) * q;
        int base = (int) Math.floor(posicao);
        double resto = posicao - base;
        if (base + 1 < ordenados.size()) return ordenados.get(base) + resto * (ordenados.get(base + 1) - ordenados.get(base));
        return ordenados.get(base);
    }

    private static double numeroOuZero(Object valor) {
        Double numero = numero(valor);
        return numero == null ? 0 : numero;
    }

    public static String periodo(Object valor, String granularidade) {
        if (valor == null) return null;
        LocalDate data;
        try {
            String texto = String.valueOf(valor);
            data = texto.length() > 10 ? OffsetDateTime.parse(texto).toLocalDate() : LocalDate.parse(texto);
        } catch (RuntimeException exception) {
            try {
                data = LocalDate.parse(String.valueOf(valor).substring(0, 10));
            } catch (RuntimeException ignored) {
                return null;
            }
        }
        return switch (granularidade) {
            case "dia" -> data.toString();
            case "semana" -> data.get(IsoFields.WEEK_BASED_YEAR) + "-S" + String.format("%02d", data.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
            case "ano" -> String.valueOf(data.getYear());
            default -> data.getYear() + "-" + String.format("%02d", data.getMonthValue());
        };
    }
}
