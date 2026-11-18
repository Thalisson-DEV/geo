package com.nexo.app.modules.automacao.application.nos;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.nexo.app.modules.automacao.application.motor.Catalogo.EspecNo;
import com.nexo.app.modules.automacao.application.motor.Catalogo.EspecParam;
import com.nexo.app.modules.automacao.application.motor.Catalogo.EspecSaida;
import com.nexo.app.modules.automacao.application.motor.Catalogo.ProvedorNos;
import com.nexo.app.modules.automacao.application.motor.ContextoAcao;
import com.nexo.app.modules.automacao.domain.expressao.Valores;
import com.nexo.app.modules.iam.UsuarioApi;
import com.nexo.app.modules.sst.SstRelatoriosApi;
import com.nexo.app.modules.sst.SstRelatoriosApi.DesvioPendente;
import com.nexo.app.modules.sst.SstRelatoriosApi.MetaPessoa;
import com.nexo.app.modules.sst.SstRelatoriosApi.MetasDaSemana;

/**
 * Relatórios prontos de SST: as metas de inspeção da semana e os desvios em aberto, com
 * o HTML montado para o e-mail. Os números são os das telas de acompanhamento.
 */
@Component
public class NosSst implements ProvedorNos {

    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final int LIMITE_DESVIOS_POR_INSPETOR = 40;

    private final SstRelatoriosApi relatorios;
    private final UsuarioApi usuarios;

    public NosSst(SstRelatoriosApi relatorios, UsuarioApi usuarios) {
        this.relatorios = relatorios;
        this.usuarios = usuarios;
    }

    private static EspecParam recorte(String chave, String rotulo, String exemplo) {
        return EspecParam.de(chave, rotulo, "text").placeholder("Vazio = todas. Ex.: " + exemplo)
                .ajuda("Separe vários com ; (sem diferenciar maiúsculas).").criar();
    }

    @Override
    public Collection<EspecNo> nos() {
        List<EspecNo> nos = new ArrayList<>();
        nos.add(EspecNo.de("ces.sst_goals", "ces", "Metas de inspeção da semana",
                        "O acompanhamento das metas de inspeção pronto para o e-mail: execução, pódio (1º a 3º), ranking por processo, "
                                + "por base e por pessoa, o que cada um lançou na semana passada e, na virada do período, como o anterior fechou.",
                        "gauge")
                .params(recorte("bases", "Só estas bases", "Juazeiro; Remanso"),
                        recorte("processes", "Só estes processos", "Comercial"))
                .saidas(EspecSaida.de("html", "Relatório (HTML para o e-mail)", "string",
                                "Use no e-mail com o bloco 'HTML de outro passo'"),
                        EspecSaida.de("period", "Período atual", "string"),
                        EspecSaida.de("people_count", "Pessoas com meta", "number"),
                        EspecSaida.de("execution", "Execução (%)", "number"),
                        EspecSaida.de("week_done", "Inspeções na semana passada", "number"),
                        EspecSaida.lista("podium", "Pódio (1º a 3º)", List.of(
                                EspecSaida.de("posicao", "Posição", "number"), EspecSaida.de("nome", "Nome", "string"),
                                EspecSaida.de("base", "Base", "string"), EspecSaida.de("percentual", "Atingimento (%)", "number"))),
                        EspecSaida.de("has_closing", "Traz o fechamento do período anterior", "boolean"))
                .executor(this::metas)
                .palavras("sst", "meta", "metas", "inspeção", "inspeções", "ranking", "pódio", "segurança", "semanal")
                .criar());
        nos.add(EspecNo.de("ces.sst_open_deviations", "ces", "Desvios em aberto",
                        "Os desvios de segurança ainda não resolvidos: o resumo da gestão por processo, base e inspetor e, "
                                + "para cada inspetor com pendência, o e-mail com os desvios dele (use 'Para cada' na lista de inspetores).",
                        "alert")
                .params(recorte("bases", "Só estas bases", "Juazeiro; Remanso"),
                        recorte("processes", "Só estes processos", "Comercial"))
                .saidas(EspecSaida.de("html", "Resumo da gestão (HTML para o e-mail)", "string",
                                "Use no e-mail com o bloco 'HTML de outro passo'"),
                        EspecSaida.de("total", "Desvios em aberto", "number"),
                        EspecSaida.de("overdue", "Vencidos", "number"),
                        EspecSaida.de("severe", "Alta e crítica", "number"),
                        EspecSaida.lista("inspectors", "Inspetores com desvios em aberto", List.of(
                                EspecSaida.de("usuario_id", "Id do usuário (use em 'Para')", "string"),
                                EspecSaida.de("nome", "Nome", "string"),
                                EspecSaida.de("primeiro_nome", "Primeiro nome", "string"),
                                EspecSaida.de("total", "Em aberto", "number"),
                                EspecSaida.de("vencidos", "Vencidos", "number"),
                                EspecSaida.de("assunto", "Assunto sugerido", "string"),
                                EspecSaida.de("tem_email", "Tem e-mail cadastrado", "boolean"),
                                EspecSaida.de("resumo", "Resumo em uma frase (para o sininho)", "string"),
                                EspecSaida.de("html", "Desvios dele (HTML para o e-mail)", "string"))),
                        EspecSaida.de("date", "Data do relatório", "string"))
                .executor(this::desvios)
                .palavras("sst", "desvio", "desvios", "pendência", "inspetor", "tratamento", "vencidos", "segurança", "semanal")
                .criar());
        return nos;
    }

    private Map<String, Object> metas(ContextoAcao ctx, Map<String, Object> p) {
        LocalDate hoje = ctx.agora().atZoneSameInstant(Valores.BRASILIA).toLocalDate();
        MetasDaSemana bruto = relatorios.metasDaSemana(hoje);
        Function<List<MetaPessoa>, List<MetaPessoa>> recortar = lista -> lista.stream()
                .filter(m -> dentro(p.get("bases"), m.base()) && dentro(p.get("processes"), m.processo())).toList();
        MetasDaSemana d = new MetasDaSemana(bruto.hoje(), bruto.semanaInicio(), bruto.semanaFim(),
                recortar.apply(bruto.pessoas()), recortar.apply(bruto.fechamentoAnterior()));

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("html", RelatoriosSstHtml.metas(d));
        r.put("period", d.pessoas().isEmpty() ? "" : RelatoriosSstHtml.periodo(d.pessoas()));
        r.put("people_count", d.pessoas().size());
        long meta = d.pessoas().stream().mapToLong(MetaPessoa::meta).sum();
        long realizado = d.pessoas().stream().mapToLong(MetaPessoa::realizado).sum();
        r.put("execution", meta == 0 ? 0 : Math.round(100.0 * realizado / meta));
        r.put("week_done", d.pessoas().stream().mapToLong(MetaPessoa::realizadoSemana).sum());
        List<Map<String, Object>> podio = new ArrayList<>();
        List<MetaPessoa> primeiros = RelatoriosSstHtml.podio(d.pessoas());
        for (int i = 0; i < primeiros.size(); i++) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("posicao", i + 1);
            m.put("nome", primeiros.get(i).nome());
            m.put("base", primeiros.get(i).base());
            m.put("percentual", primeiros.get(i).percentual());
            podio.add(m);
        }
        r.put("podium", podio);
        r.put("has_closing", !d.fechamentoAnterior().isEmpty());
        return r;
    }

    private Map<String, Object> desvios(ContextoAcao ctx, Map<String, Object> p) {
        LocalDate hoje = ctx.agora().atZoneSameInstant(Valores.BRASILIA).toLocalDate();
        List<DesvioPendente> desvios = relatorios.desviosPendentes().stream()
                .filter(d -> dentro(p.get("bases"), d.base()) && dentro(p.get("processes"), d.processo()))
                .toList();

        Map<UUID, List<DesvioPendente>> porInspetor = desvios.stream().filter(d -> d.idInspetor() != null)
                .collect(Collectors.groupingBy(DesvioPendente::idInspetor, LinkedHashMap::new, Collectors.toList()));
        Map<UUID, String> emails = porInspetor.isEmpty() ? Map.of() : usuarios.buscarEmailsPorIds(porInspetor.keySet());
        List<Map<String, Object>> inspetores = new ArrayList<>();
        porInspetor.forEach((id, lista) -> {
            String nome = lista.get(0).inspetor();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("usuario_id", id.toString());
            m.put("nome", nome);
            m.put("primeiro_nome", RelatoriosSstHtml.primeiroNome(nome));
            m.put("total", lista.size());
            long vencidos = lista.stream().filter(DesvioPendente::vencido).count();
            m.put("vencidos", vencidos);
            m.put("assunto", RelatoriosSstHtml.plural(lista.size(), "desvio em aberto", "desvios em aberto") + " nas suas inspeções"
                    + (vencidos == 0 ? "" : " (" + RelatoriosSstHtml.plural(vencidos, "vencido", "vencidos") + ")"));
            m.put("tem_email", emails.get(id) != null && !emails.get(id).isBlank());
            m.put("resumo", "Você tem " + RelatoriosSstHtml.plural(lista.size(), "desvio", "desvios") + " das suas inspeções para tratar"
                    + (vencidos == 0 ? "." : ", " + RelatoriosSstHtml.plural(vencidos, "já vencido", "já vencidos") + "."));
            m.put("html", RelatoriosSstHtml.desviosDoInspetor(nome, lista, LIMITE_DESVIOS_POR_INSPETOR));
            inspetores.add(m);
        });
        // Quem tem mais vencidos recebe primeiro: se o envio parar no meio, os casos mais urgentes já saíram.
        inspetores.sort((a, b) -> Double.compare(Valores.dbl(b.get("vencidos")), Valores.dbl(a.get("vencidos"))));

        Map<String, Object> r = new LinkedHashMap<>();
        long semEmail = inspetores.stream().filter(m -> !Boolean.TRUE.equals(m.get("tem_email"))).count();
        r.put("html", RelatoriosSstHtml.desviosGeral(desvios, semEmail));
        r.put("total", desvios.size());
        r.put("overdue", desvios.stream().filter(DesvioPendente::vencido).count());
        r.put("severe", desvios.stream().filter(d -> RelatoriosSstHtml.peso(d.gravidade()) >= 3).count());
        r.put("inspectors", inspetores);
        r.put("date", hoje.format(DATA));
        return r;
    }

    /** O valor está no recorte informado (lista separada por ;)? Recorte vazio aceita tudo. */
    static boolean dentro(Object recorte, String valor) {
        String texto = Valores.texto(recorte).strip();
        if (texto.isEmpty()) return true;
        if (valor == null) return false;
        Set<String> aceitos = new java.util.HashSet<>();
        for (String parte : texto.split(";")) {
            if (!parte.isBlank()) aceitos.add(parte.strip().toLowerCase(Locale.ROOT));
        }
        return aceitos.isEmpty() || aceitos.contains(valor.strip().toLowerCase(Locale.ROOT));
    }
}
