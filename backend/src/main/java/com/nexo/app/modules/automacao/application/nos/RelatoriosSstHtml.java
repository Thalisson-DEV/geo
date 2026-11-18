package com.nexo.app.modules.automacao.application.nos;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;

import com.nexo.app.modules.sst.SstRelatoriosApi.DesvioPendente;
import com.nexo.app.modules.sst.SstRelatoriosApi.MetaPessoa;
import com.nexo.app.modules.sst.SstRelatoriosApi.MetasDaSemana;

/**
 * O HTML dos relatórios semanais de SST, pronto para o bloco "HTML de outro passo" do
 * e-mail: tabelas simples com estilo inline, que o layout institucional envolve.
 */
public final class RelatoriosSstHtml {

    private static final Locale PT_BR = Locale.of("pt", "BR");
    private static final DateTimeFormatter DIA_MES = DateTimeFormatter.ofPattern("dd/MM");

    private static final String TEXTO = "#334155";
    private static final String FORTE = "#0f172a";
    private static final String SUAVE = "#64748b";
    private static final String BORDA = "#e2e8f0";
    private static final String FUNDO = "#f8fafc";
    private static final String MARCA = "#102A83";
    private static final String SUCESSO = "#15803d";
    private static final String ATENCAO = "#b45309";
    private static final String PERIGO = "#b91c1c";

    private RelatoriosSstHtml() {
    }

    // ============================================================================ metas

    /** Ordem do ranking: atingimento, depois realizado, depois nome. */
    static final Comparator<MetaPessoa> RANKING = Comparator
            .comparing(MetaPessoa::percentual, Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(MetaPessoa::realizado, Comparator.reverseOrder())
            .thenComparing(p -> Objects.toString(p.nome(), ""), String.CASE_INSENSITIVE_ORDER);

    /** Um recorte (processo ou base) com seus números somados. */
    record Grupo(String nome, List<MetaPessoa> pessoas, long meta, long realizado, long naMeta) {

        double execucao() {
            return meta == 0 ? 0 : (double) realizado / meta;
        }
    }

    static List<Grupo> agrupar(List<MetaPessoa> pessoas, Function<MetaPessoa, String> chave) {
        Map<String, List<MetaPessoa>> mapa = new LinkedHashMap<>();
        for (MetaPessoa p : pessoas) {
            String nome = chave.apply(p);
            mapa.computeIfAbsent(nome == null || nome.isBlank() ? "Sem cadastro" : nome, k -> new ArrayList<>()).add(p);
        }
        List<Grupo> grupos = new ArrayList<>();
        mapa.forEach((nome, lista) -> {
            List<MetaPessoa> ordenada = lista.stream().sorted(RANKING).toList();
            grupos.add(new Grupo(nome, ordenada,
                    lista.stream().mapToLong(MetaPessoa::meta).sum(),
                    lista.stream().mapToLong(MetaPessoa::realizado).sum(),
                    lista.stream().filter(p -> "ATINGIDA".equals(p.situacao())).count()));
        });
        grupos.sort(Comparator.comparingDouble(Grupo::execucao).reversed()
                .thenComparing(Grupo::realizado, Comparator.reverseOrder())
                .thenComparing(Grupo::nome, String.CASE_INSENSITIVE_ORDER));
        return grupos;
    }

    /** As três primeiras pessoas do ranking que já lançaram alguma inspeção. */
    static List<MetaPessoa> podio(List<MetaPessoa> pessoas) {
        return pessoas.stream().filter(p -> p.realizado() > 0).sorted(RANKING).limit(3).toList();
    }

    /** Como a pessoa está diante do ritmo que o período pede até hoje. */
    static String situacao(MetaPessoa p, LocalDate hoje) {
        if ("ATINGIDA".equals(p.situacao())) return "Bateu a meta";
        if ("NAO_ATINGIDA".equals(p.situacao())) return "Não bateu";
        if (p.idUsuario() == null) return "Sem usuário";
        if (p.realizado() == 0) return "Nenhuma inspeção";
        return p.realizado() >= esperadoAte(p, hoje) ? "No ritmo" : "Abaixo do ritmo";
    }

    /** Quanto já deveria ter sido feito, proporcional aos dias passados do período. */
    static double esperadoAte(MetaPessoa p, LocalDate hoje) {
        long total = ChronoUnit.DAYS.between(p.janelaInicio(), p.janelaFim()) + 1;
        long passados = Math.max(0, Math.min(total, ChronoUnit.DAYS.between(p.janelaInicio(), hoje)));
        return total <= 0 ? p.meta() : (double) p.meta() * passados / total;
    }

    private static String corSituacao(String situacao) {
        return switch (situacao) {
            case "Bateu a meta", "No ritmo" -> SUCESSO;
            case "Abaixo do ritmo" -> ATENCAO;
            case "Não bateu", "Nenhuma inspeção", "Sem usuário" -> PERIGO;
            default -> SUAVE;
        };
    }

    public static String metas(MetasDaSemana d) {
        StringBuilder h = new StringBuilder();
        if (!d.fechamentoAnterior().isEmpty()) {
            List<MetaPessoa> fechados = d.fechamentoAnterior();
            h.append(titulo("Como fechou " + periodo(fechados)));
            long meta = fechados.stream().mapToLong(MetaPessoa::meta).sum();
            long realizado = fechados.stream().mapToLong(MetaPessoa::realizado).sum();
            long bateram = fechados.stream().filter(p -> "ATINGIDA".equals(p.situacao())).count();
            h.append(kpis(List.of(
                    kpi("Execução final", pct(realizado, meta), realizado + " de " + meta + " inspeções", corExecucao(realizado, meta)),
                    kpi("Bateram a meta", bateram + " de " + fechados.size(), plural(fechados.size() - bateram, "pessoa ficou", "pessoas ficaram") + " abaixo",
                            bateram == fechados.size() ? SUCESSO : FORTE))));
            h.append(podioHtml(podio(fechados), "Pódio do período"));
            h.append(rankingGrupos("Por processo", "Processo", agrupar(fechados, MetaPessoa::processo)));
            h.append(rankingGrupos("Por base", "Base", agrupar(fechados, MetaPessoa::base)));
        }

        List<MetaPessoa> pessoas = d.pessoas();
        if (pessoas.isEmpty()) {
            h.append(paragrafo("Não há metas de inspeção vigentes neste momento."));
            return h.toString();
        }
        h.append(titulo(d.fechamentoAnterior().isEmpty() ? "Período atual: " + periodo(pessoas) : "Começou " + periodo(pessoas)));
        h.append(paragrafo(prazo(pessoas, d.hoje())));
        long meta = pessoas.stream().mapToLong(MetaPessoa::meta).sum();
        long realizado = pessoas.stream().mapToLong(MetaPessoa::realizado).sum();
        long naMeta = pessoas.stream().filter(p -> "ATINGIDA".equals(p.situacao())).count();
        long semana = pessoas.stream().mapToLong(MetaPessoa::realizadoSemana).sum();
        long noRitmo = pessoas.stream().filter(p -> List.of("Bateu a meta", "No ritmo").contains(situacao(p, d.hoje()))).count();
        h.append(kpis(List.of(
                kpi("Execução", pct(realizado, meta), realizado + " de " + meta + " inspeções", corExecucao(realizado, meta)),
                kpi("No ritmo ou na meta", noRitmo + " de " + pessoas.size(), naMeta == 0 ? "ninguém bateu a meta ainda" : plural(naMeta, "já bateu", "já bateram") + " a meta", FORTE),
                kpi("Semana passada", String.valueOf(semana), plural(semana, "inspeção", "inspeções") + " de "
                        + d.semanaInicio().format(DIA_MES) + " a " + d.semanaFim().format(DIA_MES), MARCA))));
        h.append(podioHtml(podio(pessoas), "Pódio até agora"));
        h.append(rankingGrupos("Por processo", "Processo", agrupar(pessoas, MetaPessoa::processo)));
        h.append(rankingGrupos("Por base", "Base", agrupar(pessoas, MetaPessoa::base)));
        h.append(rankingPessoas(pessoas, d.hoje()));
        h.append(atencaoMetas(pessoas, d));
        return h.toString();
    }

    private static String prazo(List<MetaPessoa> pessoas, LocalDate hoje) {
        LocalDate fim = pessoas.stream().map(MetaPessoa::janelaFim).max(Comparator.naturalOrder()).orElse(hoje);
        boolean mesmoFim = pessoas.stream().allMatch(p -> p.janelaFim().equals(fim));
        long dias = ChronoUnit.DAYS.between(hoje, fim) + 1;
        String base = dias <= 1 ? "O período termina hoje." : "Faltam " + dias + " dias para fechar o período, contando hoje.";
        if (!mesmoFim) base = "Há metas com períodos diferentes; o mais longo termina em " + fim.format(DIA_MES) + ".";
        return base + " A coluna Semana mostra as inspeções lançadas na semana passada.";
    }

    private static String podioHtml(List<MetaPessoa> podio, String rotulo) {
        if (podio.isEmpty()) return "";
        StringBuilder h = new StringBuilder(subtitulo(rotulo));
        h.append("<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" width=\"100%\" style=\"border-collapse:collapse;margin:0 0 18px\">");
        String[] fundos = {"#fef9c3", "#f1f5f9", "#fff7ed"};
        String[] bordas = {"#eab308", "#94a3b8", "#c2410c"};
        for (int i = 0; i < podio.size(); i++) {
            MetaPessoa p = podio.get(i);
            h.append("<tr><td style=\"padding:10px 12px;border-left:4px solid ").append(bordas[i]).append(";background-color:").append(fundos[i])
                    .append(";\"><table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" width=\"100%\"><tr>")
                    .append("<td style=\"width:40px;font-size:20px;font-weight:800;color:").append(FORTE).append(";vertical-align:middle\">")
                    .append(i + 1).append("º</td><td style=\"vertical-align:middle\"><div style=\"font-size:14px;font-weight:700;color:").append(FORTE).append("\">")
                    .append(esc(p.nome())).append("</div><div style=\"font-size:12px;color:").append(SUAVE).append("\">")
                    .append(esc(juntar(p.funcao(), p.base(), p.processo()))).append("</div></td>")
                    .append("<td style=\"text-align:right;vertical-align:middle;white-space:nowrap\"><div style=\"font-size:16px;font-weight:800;color:")
                    .append(FORTE).append("\">").append(pct(p.percentual())).append("</div><div style=\"font-size:12px;color:").append(SUAVE)
                    .append("\">").append(p.realizado()).append(" de ").append(p.meta()).append("</div></td></tr></table></td></tr>")
                    .append("<tr><td style=\"height:6px;line-height:6px;font-size:0\">&nbsp;</td></tr>");
        }
        return h.append("</table>").toString();
    }

    private static String rankingGrupos(String rotulo, String coluna, List<Grupo> grupos) {
        if (grupos.size() < 2 && grupos.stream().allMatch(g -> "Sem cadastro".equals(g.nome()))) return "";
        List<List<String>> linhas = new ArrayList<>();
        for (int i = 0; i < grupos.size(); i++) {
            Grupo g = grupos.get(i);
            MetaPessoa lider = g.pessoas().stream().filter(p -> p.realizado() > 0).findFirst().orElse(null);
            linhas.add(List.of(
                    posicao(i),
                    "<strong style=\"color:" + FORTE + "\">" + esc(g.nome()) + "</strong>",
                    andamento(g.realizado(), g.meta()),
                    g.naMeta() + " de " + g.pessoas().size(),
                    lider == null ? "<span style=\"color:" + SUAVE + "\">Ninguém lançou</span>"
                            : esc(lider.nome()) + "<div style=\"font-size:12px;color:" + SUAVE + "\">" + pct(lider.percentual()) + "</div>"));
        }
        return subtitulo(rotulo) + tabela(List.of("", coluna, "Andamento", "Na meta", "1º lugar"), linhas, List.of("c", "l", "l", "c", "l"));
    }

    private static String rankingPessoas(List<MetaPessoa> pessoas, LocalDate hoje) {
        List<MetaPessoa> ordenadas = pessoas.stream().sorted(RANKING).toList();
        List<List<String>> linhas = new ArrayList<>();
        for (int i = 0; i < ordenadas.size(); i++) {
            MetaPessoa p = ordenadas.get(i);
            String situacao = situacao(p, hoje);
            linhas.add(List.of(
                    posicao(i),
                    "<strong style=\"color:" + FORTE + "\">" + esc(p.nome()) + "</strong><div style=\"font-size:12px;color:" + SUAVE + "\">"
                            + esc(juntar(p.funcao(), p.base(), p.processo())) + "</div>",
                    andamento(p.realizado(), p.meta()),
                    p.realizadoSemana() == 0 ? "<span style=\"color:" + SUAVE + "\">0</span>" : "+" + p.realizadoSemana(),
                    "<span style=\"color:" + corSituacao(situacao) + ";font-weight:600\">" + situacao + "</span>"));
        }
        return subtitulo("Por pessoa") + tabela(List.of("", "Pessoa", "Andamento", "Semana", "Situação"), linhas, List.of("c", "l", "l", "c", "l"));
    }

    private static String atencaoMetas(List<MetaPessoa> pessoas, MetasDaSemana d) {
        List<String> itens = new ArrayList<>();
        List<String> semUsuario = pessoas.stream().filter(p -> p.idUsuario() == null).map(MetaPessoa::nome).toList();
        if (!semUsuario.isEmpty()) {
            itens.add(plural(semUsuario.size(), "pessoa não tem", "pessoas não têm") + " usuário no GEO e não consegue lançar inspeções: "
                    + esc(String.join(", ", semUsuario)) + ".");
        }
        List<String> paradas = pessoas.stream()
                .filter(p -> p.idUsuario() != null && p.realizadoSemana() == 0 && !"ATINGIDA".equals(p.situacao())
                        && !p.janelaInicio().isAfter(d.semanaFim()))
                .map(MetaPessoa::nome).toList();
        if (!paradas.isEmpty()) {
            itens.add(plural(paradas.size(), "pessoa não lançou", "pessoas não lançaram") + " nenhuma inspeção na semana passada: "
                    + esc(String.join(", ", paradas)) + ".");
        }
        if (itens.isEmpty()) return "";
        StringBuilder h = new StringBuilder(subtitulo("Pontos de atenção"));
        h.append("<ul style=\"margin:4px 0 14px;padding-left:22px;color:").append(TEXTO).append(";font-size:13px;line-height:1.6\">");
        itens.forEach(i -> h.append("<li style=\"margin:0 0 6px\">").append(i).append("</li>"));
        return h.append("</ul>").toString();
    }

    /** "outubro de 2026" quando o período é um mês inteiro; senão as datas. */
    static String periodo(List<MetaPessoa> pessoas) {
        LocalDate inicio = pessoas.stream().map(MetaPessoa::janelaInicio).min(Comparator.naturalOrder()).orElseThrow();
        LocalDate fim = pessoas.stream().map(MetaPessoa::janelaFim).max(Comparator.naturalOrder()).orElseThrow();
        if (inicio.getDayOfMonth() == 1 && fim.equals(inicio.withDayOfMonth(inicio.lengthOfMonth()))) {
            return inicio.getMonth().getDisplayName(TextStyle.FULL, PT_BR) + " de " + inicio.getYear();
        }
        return inicio.format(DIA_MES) + " a " + fim.format(DIA_MES);
    }

    private static String andamento(long realizado, long meta) {
        double fracao = meta == 0 ? 0 : Math.min(1, (double) realizado / meta);
        int largura = (int) Math.round(fracao * 100);
        String cor = corExecucao(realizado, meta);
        return "<div style=\"font-size:13px;color:" + FORTE + ";white-space:nowrap\"><strong>" + pct(realizado, meta) + "</strong>"
                + " <span style=\"color:" + SUAVE + "\">" + realizado + " de " + meta + "</span></div>"
                + "<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" width=\"100%\" style=\"margin-top:4px;border-collapse:collapse\"><tr>"
                + (largura > 0 ? "<td width=\"" + largura + "%\" style=\"height:5px;line-height:5px;font-size:0;background-color:" + cor + "\">&nbsp;</td>" : "")
                + (largura < 100 ? "<td style=\"height:5px;line-height:5px;font-size:0;background-color:" + BORDA + "\">&nbsp;</td>" : "")
                + "</tr></table>";
    }

    private static String corExecucao(long realizado, long meta) {
        if (meta == 0) return SUAVE;
        double f = (double) realizado / meta;
        return f >= 1 ? SUCESSO : f >= 0.5 ? MARCA : ATENCAO;
    }

    // ============================================================================ desvios

    /** Vencidos primeiro (do mais atrasado), depois o prazo mais próximo; sem prazo no fim. */
    static final Comparator<DesvioPendente> URGENCIA = Comparator
            .comparing((DesvioPendente d) -> d.vencido() ? 0 : 1)
            .thenComparing(d -> d.diasEmAtraso() == null ? 0 : -d.diasEmAtraso())
            .thenComparing(DesvioPendente::prazo, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(d -> -peso(d.gravidade()));

    static int peso(String gravidade) {
        return switch (gravidade == null ? "" : gravidade) {
            case "CRITICA" -> 4;
            case "ALTA" -> 3;
            case "MEDIA" -> 2;
            case "BAIXA" -> 1;
            default -> 0;
        };
    }

    private static boolean grave(DesvioPendente d) {
        return peso(d.gravidade()) >= 3;
    }

    /** O e-mail de um inspetor: os desvios das inspeções dele que ainda estão em aberto. */
    public static String desviosDoInspetor(String nome, List<DesvioPendente> desvios, int limite) {
        List<DesvioPendente> ordenados = desvios.stream().sorted(URGENCIA).toList();
        long vencidos = desvios.stream().filter(DesvioPendente::vencido).count();
        long graves = desvios.stream().filter(RelatoriosSstHtml::grave).count();
        StringBuilder h = new StringBuilder();
        h.append(paragrafo("Olá, " + esc(primeiroNome(nome)) + ". "
                + (desvios.size() == 1 ? "Este desvio, apontado em uma inspeção sua, ainda está em aberto."
                : "Estes desvios, apontados nas suas inspeções, ainda estão em aberto.")
                + " Como foi você quem registrou a inspeção, é você quem registra a correção no GEO."));
        h.append(kpis(List.of(
                kpi("Em aberto", String.valueOf(desvios.size()), plural(desvios.size(), "desvio", "desvios"), FORTE),
                kpi("Vencidos", String.valueOf(vencidos), vencidos == 0 ? "nenhum passou do prazo" : "passaram do prazo", vencidos == 0 ? SUCESSO : PERIGO),
                kpi("Alta e crítica", String.valueOf(graves), "gravidade", graves == 0 ? FORTE : ATENCAO))));
        h.append(subtitulo(vencidos > 0 ? "Comece pelos vencidos" : "Seus desvios em aberto"));
        h.append(tabelaDesvios(ordenados.stream().limit(limite).toList(), false));
        if (ordenados.size() > limite) {
            h.append(paragrafo("E mais " + plural(ordenados.size() - limite, "desvio", "desvios") + " no GEO."));
        }
        return h.toString();
    }

    /** A visão da gestão: todos os desvios em aberto por processo, base e inspetor. */
    public static String desviosGeral(List<DesvioPendente> desvios, long inspetoresSemEmail) {
        StringBuilder h = new StringBuilder();
        if (desvios.isEmpty()) {
            return paragrafo("Nenhum desvio em aberto: todos os desvios apontados nas inspeções já foram tratados.");
        }
        long vencidos = desvios.stream().filter(DesvioPendente::vencido).count();
        long graves = desvios.stream().filter(RelatoriosSstHtml::grave).count();
        long semPrazo = desvios.stream().filter(d -> d.prazo() == null).count();
        long inspetores = desvios.stream().map(DesvioPendente::idInspetor).filter(Objects::nonNull).distinct().count();
        h.append(kpis(List.of(
                kpi("Em aberto", String.valueOf(desvios.size()), plural(inspetores, "inspetor responsável", "inspetores responsáveis"), FORTE),
                kpi("Vencidos", String.valueOf(vencidos), pct(vencidos, desvios.size()) + " do total", vencidos == 0 ? SUCESSO : PERIGO),
                kpi("Alta e crítica", String.valueOf(graves), semPrazo == 0 ? "gravidade" : plural(semPrazo, "sem prazo definido", "sem prazo definido"),
                        graves == 0 ? FORTE : ATENCAO))));
        h.append(rankingDesvios("Por processo", "Processo", desvios, DesvioPendente::processo));
        h.append(rankingDesvios("Por base", "Base", desvios, DesvioPendente::base));
        h.append(rankingDesvios("Por inspetor", "Inspetor", desvios, DesvioPendente::inspetor));
        List<DesvioPendente> atrasados = desvios.stream().filter(DesvioPendente::vencido).sorted(URGENCIA).limit(10).toList();
        if (!atrasados.isEmpty()) {
            h.append(subtitulo(atrasados.size() == 1 ? "O desvio vencido" : "Os " + atrasados.size() + " mais atrasados"));
            h.append(tabelaDesvios(atrasados, true));
        }
        if (inspetoresSemEmail > 0) {
            h.append(paragrafo("<span style=\"color:" + SUAVE + ";font-size:13px\">"
                    + (inspetoresSemEmail == 1 ? "1 inspetor não tem e-mail cadastrado e recebe" : inspetoresSemEmail + " inspetores não têm e-mail cadastrado e recebem")
                    + " o aviso dos próprios desvios só pelo sininho do GEO.</span>"));
        }
        return h.toString();
    }

    private static String rankingDesvios(String rotulo, String coluna, List<DesvioPendente> desvios, Function<DesvioPendente, String> chave) {
        Map<String, List<DesvioPendente>> grupos = new LinkedHashMap<>();
        for (DesvioPendente d : desvios) {
            String nome = chave.apply(d);
            grupos.computeIfAbsent(nome == null || nome.isBlank() ? "Sem cadastro" : nome, k -> new ArrayList<>()).add(d);
        }
        if (grupos.size() < 2 && grupos.containsKey("Sem cadastro")) return "";
        List<Map.Entry<String, List<DesvioPendente>>> ordem = new ArrayList<>(grupos.entrySet());
        ordem.sort(Comparator.<Map.Entry<String, List<DesvioPendente>>>comparingLong(e -> e.getValue().stream().filter(DesvioPendente::vencido).count())
                .reversed()
                .thenComparing(e -> e.getValue().size(), Comparator.reverseOrder())
                .thenComparing(Map.Entry::getKey, String.CASE_INSENSITIVE_ORDER));
        List<List<String>> linhas = new ArrayList<>();
        for (int i = 0; i < ordem.size(); i++) {
            List<DesvioPendente> lista = ordem.get(i).getValue();
            long vencidos = lista.stream().filter(DesvioPendente::vencido).count();
            long graves = lista.stream().filter(RelatoriosSstHtml::grave).count();
            int maiorAtraso = lista.stream().map(DesvioPendente::diasEmAtraso).filter(Objects::nonNull).max(Integer::compare).orElse(0);
            linhas.add(List.of(
                    posicao(i),
                    "<strong style=\"color:" + FORTE + "\">" + esc(ordem.get(i).getKey()) + "</strong>",
                    String.valueOf(lista.size()),
                    vencidos == 0 ? "<span style=\"color:" + SUAVE + "\">0</span>" : "<strong style=\"color:" + PERIGO + "\">" + vencidos + "</strong>",
                    graves == 0 ? "<span style=\"color:" + SUAVE + "\">0</span>" : String.valueOf(graves),
                    maiorAtraso == 0 ? "<span style=\"color:" + SUAVE + "\">—</span>" : plural(maiorAtraso, "dia", "dias")));
        }
        return subtitulo(rotulo) + tabela(List.of("", coluna, "Em aberto", "Vencidos", "Alta e crítica", "Maior atraso"), linhas,
                List.of("c", "l", "c", "c", "c", "r"));
    }

    private static String tabelaDesvios(List<DesvioPendente> desvios, boolean mostrarInspetor) {
        List<List<String>> linhas = new ArrayList<>();
        for (DesvioPendente d : desvios) {
            String oque = d.descricao() != null && !d.descricao().isBlank() ? d.descricao() : d.pergunta();
            String contexto = juntar(mostrarInspetor ? d.inspetor() : null, d.base(), d.equipe(),
                    d.dataInspecao() == null ? null : "inspeção de " + d.dataInspecao().format(DIA_MES));
            linhas.add(List.of(
                    "<strong style=\"color:" + FORTE + "\">" + esc(resumir(oque, 140)) + "</strong>"
                            + (d.pergunta() != null && !Objects.equals(d.pergunta(), oque)
                            ? "<div style=\"font-size:12px;color:" + SUAVE + "\">" + esc(resumir(d.pergunta(), 110)) + "</div>" : "")
                            + "<div style=\"font-size:12px;color:" + SUAVE + "\">" + esc(contexto) + "</div>",
                    gravidade(d.gravidade()),
                    prazo(d) + "<div style=\"font-size:12px;color:" + SUAVE + "\">"
                            + ("EM_TRATAMENTO".equals(d.status()) ? "Em tratamento" : "Aberto") + "</div>"));
        }
        return tabela(List.of("Desvio", "Gravidade", "Prazo"), linhas, List.of("l", "l", "l"));
    }

    private static String prazo(DesvioPendente d) {
        if (d.prazo() == null) return "<span style=\"color:" + SUAVE + "\">Sem prazo</span>";
        if (d.vencido()) {
            int dias = d.diasEmAtraso() == null ? 0 : d.diasEmAtraso();
            return "<strong style=\"color:" + PERIGO + ";white-space:nowrap\">Venceu há " + plural(dias, "dia", "dias") + "</strong>";
        }
        return "<span style=\"white-space:nowrap\">Vence " + d.prazo().format(DIA_MES) + "</span>";
    }

    private static String gravidade(String g) {
        String rotulo = switch (g == null ? "" : g) {
            case "CRITICA" -> "Crítica";
            case "ALTA" -> "Alta";
            case "MEDIA" -> "Média";
            case "BAIXA" -> "Baixa";
            default -> "—";
        };
        String cor = switch (peso(g)) {
            case 4 -> PERIGO;
            case 3 -> "#c2410c";
            case 2 -> ATENCAO;
            default -> SUAVE;
        };
        return "<span style=\"color:" + cor + ";font-weight:600\">" + rotulo + "</span>";
    }

    // ============================================================================ peças

    record Kpi(String rotulo, String valor, String detalhe, String cor) {
    }

    private static Kpi kpi(String rotulo, String valor, String detalhe, String cor) {
        return new Kpi(rotulo, valor, detalhe, cor);
    }

    private static String kpis(List<Kpi> kpis) {
        StringBuilder h = new StringBuilder("<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" width=\"100%\" "
                + "style=\"border-collapse:separate;border-spacing:6px 0;margin:0 0 18px\"><tr>");
        int largura = 100 / kpis.size();
        for (Kpi k : kpis) {
            h.append("<td width=\"").append(largura).append("%\" style=\"padding:12px 12px 10px;background-color:").append(FUNDO)
                    .append(";border:1px solid ").append(BORDA).append(";vertical-align:top\">")
                    .append("<div style=\"font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:").append(SUAVE).append("\">")
                    .append(esc(k.rotulo())).append("</div><div style=\"margin-top:4px;font-size:22px;font-weight:800;line-height:1.15;color:")
                    .append(k.cor()).append("\">").append(esc(k.valor())).append("</div><div style=\"margin-top:2px;font-size:12px;color:")
                    .append(SUAVE).append("\">").append(esc(k.detalhe())).append("</div></td>");
        }
        return h.append("</tr></table>").toString();
    }

    private static String tabela(List<String> cabecalhos, List<List<String>> linhas, List<String> alinhamentos) {
        StringBuilder h = new StringBuilder("<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" width=\"100%\" "
                + "style=\"border-collapse:collapse;margin:0 0 20px\"><thead><tr>");
        for (int i = 0; i < cabecalhos.size(); i++) {
            h.append("<th style=\"padding:7px 8px;border-bottom:2px solid #cbd5e1;font-size:11px;font-weight:700;text-transform:uppercase;"
                    + "letter-spacing:0.03em;color:").append(SUAVE).append(";text-align:").append(alinhar(alinhamentos.get(i))).append("\">")
                    .append(esc(cabecalhos.get(i))).append("</th>");
        }
        h.append("</tr></thead><tbody>");
        for (int l = 0; l < linhas.size(); l++) {
            List<String> linha = linhas.get(l);
            h.append("<tr>");
            for (int i = 0; i < linha.size(); i++) {
                h.append("<td style=\"padding:8px;border-bottom:1px solid ").append(BORDA).append(";font-size:13px;line-height:1.4;color:")
                        .append(TEXTO).append(";vertical-align:top;text-align:").append(alinhar(alinhamentos.get(i)))
                        .append(l < 3 && "c".equals(alinhamentos.get(0)) && i == 0 && cabecalhos.get(0).isEmpty() ? ";font-weight:800" : "")
                        .append("\">").append(linha.get(i)).append("</td>");
            }
            h.append("</tr>");
        }
        return h.append("</tbody></table>").toString();
    }

    private static String alinhar(String a) {
        return switch (a) {
            case "c" -> "center";
            case "r" -> "right";
            default -> "left";
        };
    }

    private static String posicao(int i) {
        return (i + 1) + "º";
    }

    private static String titulo(String texto) {
        return "<h2 style=\"margin:22px 0 10px;font-size:17px;line-height:1.3;color:" + FORTE + "\">" + esc(primeiraMaiuscula(texto)) + "</h2>";
    }

    private static String subtitulo(String texto) {
        return "<h3 style=\"margin:18px 0 8px;font-size:14px;line-height:1.3;color:" + FORTE + "\">" + esc(texto) + "</h3>";
    }

    private static String paragrafo(String html) {
        return "<p style=\"margin:0 0 14px;font-size:14px;line-height:1.6;color:" + TEXTO + "\">" + html + "</p>";
    }

    static String pct(long parte, long total) {
        if (total == 0) return "0%";
        return Math.round(100.0 * parte / total) + "%";
    }

    static String pct(BigDecimal percentual) {
        return percentual == null ? "0%" : percentual.setScale(0, RoundingMode.HALF_UP).toPlainString() + "%";
    }

    static String plural(long n, String um, String varios) {
        return n + " " + (n == 1 ? um : varios);
    }

    private static String juntar(String... partes) {
        List<String> validas = new ArrayList<>();
        for (String p : partes) if (p != null && !p.isBlank()) validas.add(p.strip());
        return String.join(" · ", validas);
    }

    static String primeiroNome(String nome) {
        if (nome == null || nome.isBlank()) return "";
        String primeiro = nome.strip().split("\\s+")[0];
        return primeiraMaiuscula(primeiro.toLowerCase(PT_BR));
    }

    private static String primeiraMaiuscula(String texto) {
        return texto == null || texto.isEmpty() ? "" : texto.substring(0, 1).toUpperCase(PT_BR) + texto.substring(1);
    }

    private static String resumir(String texto, int max) {
        if (texto == null) return "";
        String t = texto.strip().replaceAll("\\s+", " ");
        return t.length() <= max ? t : t.substring(0, max - 1).strip() + "…";
    }

    private static String esc(String texto) {
        return MarkdownHtml.escapar(texto == null ? "" : texto);
    }
}
