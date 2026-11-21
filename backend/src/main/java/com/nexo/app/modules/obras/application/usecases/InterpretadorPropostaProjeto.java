package com.nexo.app.modules.obras.application.usecases;

import com.fasterxml.jackson.core.json.JsonReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.nexo.app.modules.obras.domain.PontoPlanejamento;
import com.nexo.app.modules.obras.domain.PropostaPlanejamento;
import com.nexo.app.modules.obras.domain.PropostaPlanejamento.KitSugerido;
import com.nexo.app.modules.obras.domain.PropostaPlanejamento.PontoSugerido;
import com.nexo.app.modules.obras.domain.PropostaPlanejamento.VaoSugerido;
import com.nexo.app.modules.obras.domain.TipoPontoPlanejamento;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Junta o que foi lido do PDF com a resposta do modelo: traz as coordenadas do bloco para a página, une o que apareceu
 * em mais de um bloco, numera os pontos sem número seguindo a rede e procura os kits no catálogo. Kit nunca vem do
 * modelo: ele só informa o texto lido na folha.
 */
final class InterpretadorPropostaProjeto {

    private static final int MAXIMO_KITS_POR_TEXTO = 3;
    private static final int MAXIMO_VAOS_CITADOS = 3;
    /** Termos do kit: separados por espaço, parênteses, vírgula, ponto e vírgula e "+" (mantém "IM-1" e "9/400" inteiros). */
    private static final Pattern SEPARADOR_TERMOS = Pattern.compile("[\\s(),;+]+");
    private static final int TERMO_LONGO = 6;
    /** Cotas lidas necessárias para calibrar a proporção da folha. */
    private static final int MINIMO_COTAS_PROPORCAO = 3;
    /** Quanto a cota pode fugir da proporção das outras antes de pedir conferência (60% a mais ou a menos). */
    private static final double DESVIO_COTA = 1.6;
    private static final double CONFIANCA_COTA_DUVIDOSA = 0.4;
    private static final Pattern FASES = Pattern.compile("(\\d)\\s*#\\s*(\\d+)");
    /** Balão riscado com X na folha: estrutura existente que sai. */
    static final String A_RETIRAR = "A retirar";
    /** Balão riscado e balão novo para o mesmo ponto. */
    static final String TROCA = "Troca de estrutura: a existente sai";
    private static final double CONFIANCA_CAMADA = 0.95;
    private static final double ALCANCE_SIMBOLO = 0.06;
    /** 1 ponto de PDF em metros no papel. */
    private static final double METROS_POR_PONTO = 0.0254 / 72;
    private static final Pattern BITOLA = Pattern.compile("\\d+\\s*[xX×]\\s*\\d+");
    /** Modelos às vezes deixam comentário ou vírgula sobrando: isso não invalida o que foi lido. */
    private static final ObjectMapper JSON = JsonMapper.builder()
            .enable(JsonReadFeature.ALLOW_JAVA_COMMENTS)
            .enable(JsonReadFeature.ALLOW_TRAILING_COMMA)
            .enable(JsonReadFeature.ALLOW_SINGLE_QUOTES)
            .build();

    /** Kit do catálogo do contrato, só com o necessário para a busca. */
    record KitCatalogo(UUID id, String codigo, String descricao, String grupo) {
    }

    private final int pagina;
    private final Set<String> numerosExistentes;
    private final List<KitCatalogo> catalogo;
    private final Map<String, String> barramentosExistentes;
    private final Map<String, Lido> pontos = new LinkedHashMap<>();
    private final Map<String, VaoLido> vaos = new LinkedHashMap<>();
    private final Map<String, String> caixasUnidas = new LinkedHashMap<>();
    private final Set<String> avisos = new LinkedHashSet<>();

    /** Metros por ponto de PDF tirados das cotas já planejadas em outras folhas da obra; nulo quando não há. */
    private Double proporcaoDaObra;

    /** Tamanho da folha em metros por unidade de [0,1], quando a escala é conhecida. */
    private Integer escala;
    private double larguraPt;
    private double alturaPt;

    /**
     * @param referencia identifica a sugestão: o número ou o código lido, ou CX1, CX2 para caixa sem código
     * @param numero     número escrito na folha; nulo quando será atribuído na sequência da rede
     * @param daCamada   veio do texto do PDF: o modelo não troca o que foi lido, só ajusta a posição
     */
    private record Lido(String referencia, String numero, TipoPontoPlanejamento tipo, double x, double y, String barramento,
                        List<String> textos, double confianca, boolean daCamada) {
    }

    private record VaoLido(String a, String b, BigDecimal metragem, String condutor, double confianca) {
    }

    InterpretadorPropostaProjeto(int pagina, Collection<String> numerosExistentes, List<KitCatalogo> catalogo) {
        this(pagina, numerosExistentes, Map.of(), catalogo);
    }

    /**
     * @param barramentosExistentes código já planejado → número do ponto. O mesmo poste aparece nas duas folhas onde a rede
     *                              continua: ele não vira ponto novo, e os vãos ligam ao que já existe.
     */
    InterpretadorPropostaProjeto(int pagina, Collection<String> numerosExistentes, Map<String, String> barramentosExistentes,
                                 List<KitCatalogo> catalogo) {
        this.pagina = pagina;
        this.numerosExistentes = new LinkedHashSet<>(numerosExistentes);
        this.barramentosExistentes = barramentosExistentes;
        this.catalogo = catalogo;
    }

    /** O que foi lido do texto do PDF, antes de consultar o modelo. */
    void adicionarCamada(LeitorCamadaProjeto.CamadaPagina camada) {
        this.escala = camada.escala();
        this.larguraPt = camada.larguraPt();
        this.alturaPt = camada.alturaPt();
        int caixas = 0;
        for (LeitorCamadaProjeto.Candidato candidato : camada.candidatos()) {
            if (candidato.codigo() != null && barramentosExistentes.containsKey(candidato.codigo())) {
                continue;
            }
            String referencia = candidato.codigo() != null ? candidato.codigo() : "CX" + (++caixas);
            pontos.put(referencia, new Lido(referencia, null, TipoPontoPlanejamento.POSTE, candidato.x(), candidato.y(),
                    candidato.codigo(), candidato.estruturas(), CONFIANCA_CAMADA, true));
        }
    }

    /**
     * Lista para o modelo: ele usa estes códigos em vez de tentar ler a folha de novo. Vai sem a posição do texto, senão
     * o modelo a repete em vez de localizar o símbolo.
     */
    String descreverCandidatos() {
        StringBuilder texto = new StringBuilder();
        for (Lido ponto : pontos.values()) {
            texto.append(ponto.referencia());
            if (!ponto.textos().isEmpty()) {
                texto.append(" (").append(String.join("; ", ponto.textos())).append(")");
            }
            texto.append('\n');
        }
        return texto.toString();
    }

    /**
     * Proporção das outras folhas do mesmo projeto: folha sem cota escrita ainda estima o vão pelo desenho, em vez de
     * cair na escala do carimbo (que não vale para prancha impressa reduzida).
     */
    void usarProporcaoDaObra(Double metrosPorPonto) {
        this.proporcaoDaObra = metrosPorPonto != null && metrosPorPonto > 0 ? metrosPorPonto : null;
    }

    void avisar(String aviso) {
        avisos.add(aviso);
    }

    void adicionarBloco(String resposta, RenderizadorPaginaProjeto.Bloco bloco) {
        if (!tentarBloco(resposta, bloco)) {
            avisos.add("Parte da folha não pôde ser interpretada e ficou de fora.");
        }
    }

    /**
     * @return false quando a resposta não é o JSON esperado, para quem chamou poder perguntar de novo
     */
    boolean tentarBloco(String resposta, RenderizadorPaginaProjeto.Bloco bloco) {
        JsonNode raiz = lerJson(resposta);
        if (raiz == null) {
            return false;
        }
        if (escala == null && raiz.path("escala").isNumber() && raiz.path("escala").asInt() >= 50) {
            escala = raiz.path("escala").asInt();
        }
        int semIdentificacao = 0;
        for (JsonNode no : raiz.path("pontos")) {
            double[] naPagina = RenderizadorPaginaProjeto.paraPagina(
                    limitar(bloco.inicioX() + no.path("x").asDouble(0.5) * bloco.largura()),
                    limitar(bloco.inicioY() + no.path("y").asDouble(0.5) * bloco.altura()), bloco.rotacao());
            double x = limitar(naPagina[0]);
            double y = limitar(naPagina[1]);
            List<String> textos = new ArrayList<>();
            adicionar(textos, texto(no, "poste"));
            for (JsonNode estrutura : no.path("estruturas")) {
                adicionar(textos, estrutura.asText(null));
            }
            if (no.path("retirar").asBoolean(false)) {
                adicionar(textos, A_RETIRAR);
            }
            String id = identificador(no);
            if (id == null) {
                semIdentificacao++;
                continue;
            }
            if (barramentosExistentes.containsKey(id)) {
                continue;
            }
            // Caixa ou balão ligado por linha a um ponto da lista: é informação dele, não outro ponto.
            String dono = texto(no, "pertence_a");
            if (dono != null && pontos.containsKey(id) && pontos.containsKey(dono.toUpperCase(Locale.ROOT))
                    && !id.equals(dono.toUpperCase(Locale.ROOT))) {
                juntarCaixa(id, dono.toUpperCase(Locale.ROOT), texto(no, "numero"));
                continue;
            }
            String numero = texto(no, "numero");
            Lido novo = new Lido(id, numero != null ? referencia(numero) : null, tipo(texto(no, "tipo")), x, y, texto(no, "barramento"), textos,
                    limitar(no.path("confianca").asDouble(0.5)), false);
            pontos.merge(id, novo, InterpretadorPropostaProjeto::unir);
        }
        if (semIdentificacao > 0) {
            avisos.add("Há pontos na folha sem número legível: confira e marque manualmente.");
        }
        lerVaos(raiz);
        return true;
    }

    /**
     * Resposta da passada final, em que o modelo vê a folha inteira com os pontos já marcados e só liga um ao outro.
     * Os pontos que ele devolver são ignorados: a posição deles já veio dos blocos, com mais resolução.
     */
    boolean adicionarVaos(String resposta) {
        JsonNode raiz = lerJson(resposta);
        if (raiz == null) {
            return false;
        }
        lerVaos(raiz);
        return true;
    }

    /** Pontos lidos até agora, com o rótulo que o modelo vai ver desenhado na folha. */
    List<RenderizadorPaginaProjeto.Marcador> marcadores() {
        return pontos.values().stream()
                .map(p -> new RenderizadorPaginaProjeto.Marcador(p.numero() != null ? p.numero() : p.referencia(), p.x(), p.y()))
                .toList();
    }

    int quantidadePontos() {
        return pontos.size();
    }

    private void lerVaos(JsonNode raiz) {
        for (JsonNode no : raiz.path("vaos")) {
            String de = texto(no, "de");
            String para = texto(no, "para");
            if (de == null || para == null || de.length() > 20 || para.length() > 20) {
                continue;
            }
            String a = resolverReferencia(de);
            String b = resolverReferencia(para);
            if (a.equals(b)) {
                continue;
            }
            String chave = a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a;
            VaoLido novo = new VaoLido(a, b, metragem(no.path("metragem")), texto(no, "condutor"),
                    limitar(no.path("confianca").asDouble(0.5)));
            vaos.merge(chave, novo, InterpretadorPropostaProjeto::unirVao);
        }
    }

    /** Fica o mais confiável, sem perder a metragem e o condutor que só o outro leu. */
    private static VaoLido unirVao(VaoLido atual, VaoLido outro) {
        VaoLido base = outro.confianca() > atual.confianca() ? outro : atual;
        VaoLido resto = base == outro ? atual : outro;
        return new VaoLido(base.a(), base.b(), base.metragem() != null ? base.metragem() : resto.metragem(),
                base.condutor() != null ? base.condutor() : resto.condutor(), base.confianca());
    }

    PropostaPlanejamento concluir() {
        Map<String, String> numeros = numerar();
        List<PontoSugerido> sugeridos = pontos.values().stream()
                .sorted(Comparator.comparing(p -> numeros.get(p.referencia()), InterpretadorPropostaProjeto::compararNumero))
                .map(p -> new PontoSugerido(p.referencia(), numeros.get(p.referencia()), p.tipo(), pagina, coordenada(p.x()),
                        coordenada(p.y()), p.barramento(), p.textos(), p.confianca(),
                        numerosExistentes.contains(numeros.get(p.referencia())),
                        // Estrutura que sai não recebe kit de instalação: a retirada é planejada à parte.
                        p.textos().contains(A_RETIRAR) ? List.of() : kits(p.textos(), false)))
                .toList();

        List<VaoSugerido> vaosSugeridos = new ArrayList<>();
        List<String> semPonto = new ArrayList<>();
        Double daFolha = proporcaoDasCotas();
        Double metrosPorPonto = daFolha != null ? daFolha : proporcaoDaObra;
        String origemEstimativa = daFolha != null ? "metragem estimada pelas cotas da folha" : "metragem estimada pelas cotas das outras folhas";
        for (VaoLido vao : vaos.values()) {
            String a = existente(vao.a());
            String b = existente(vao.b());
            if (!conhecido(a) || !conhecido(b)) {
                semPonto.add(vao.a() + " — " + vao.b());
                continue;
            }
            List<String> textos = new ArrayList<>();
            adicionar(textos, vao.condutor());
            BigDecimal metragem = vao.metragem();
            double confianca = vao.confianca();
            Double pelaFolha = metrosPorPonto != null ? distanciaPt(a, b) : null;
            if (metragem == null && pelaFolha != null) {
                metragem = BigDecimal.valueOf(pelaFolha * metrosPorPonto).setScale(1, RoundingMode.HALF_UP);
                textos.add(origemEstimativa);
            } else if (metragem == null) {
                metragem = estimarMetragem(a, b);
                if (metragem != null) {
                    textos.add("metragem estimada pela escala 1:" + escala);
                }
            } else if (pelaFolha != null && pelaFolha > 0) {
                // Cota fora da proporção das outras: costuma ser outro número lido (bitola, poste) no lugar da metragem.
                double esperado = pelaFolha * metrosPorPonto;
                double razao = metragem.doubleValue() / esperado;
                if (razao < 1 / DESVIO_COTA || razao > DESVIO_COTA) {
                    textos.add("confira a metragem: pela folha seria cerca de " + Math.round(esperado) + " m");
                    confianca = Math.min(confianca, CONFIANCA_COTA_DUVIDOSA);
                }
            }
            vaosSugeridos.add(new VaoSugerido(a, b, metragem, textos, confianca, kits(textos, true)));
        }
        avisarVaosSemPonto(semPonto);
        return new PropostaPlanejamento(sugeridos, vaosSugeridos, List.copyOf(avisos));
    }

    /** Até três vãos são citados um a um; mais que isso vira um aviso só, para a revisão não virar uma lista enorme. */
    private void avisarVaosSemPonto(List<String> semPonto) {
        if (semPonto.size() <= MAXIMO_VAOS_CITADOS) {
            semPonto.forEach(vao -> avisos.add("O vão " + vao + " cita um ponto que não foi encontrado e ficou de fora."));
        } else {
            avisos.add(semPonto.size() + " vãos citam pontos que não foram encontrados e ficaram de fora (ex.: "
                    + String.join(", ", semPonto.subList(0, MAXIMO_VAOS_CITADOS)) + "). Confira as ligações na folha.");
        }
    }

    /** Mantém o número escrito na folha; os demais seguem a rede, a partir do próximo número livre da obra. */
    private Map<String, String> numerar() {
        Map<String, String> numeros = new LinkedHashMap<>();
        pontos.values().stream().filter(p -> p.numero() != null).forEach(p -> numeros.put(p.referencia(), p.numero()));

        int proximo = 1 + java.util.stream.Stream.concat(numerosExistentes.stream(), numeros.values().stream())
                .filter(n -> n.matches("\\d{1,9}"))
                .mapToInt(Integer::parseInt)
                .max().orElse(0);

        Map<String, List<String>> ligacoes = new LinkedHashMap<>();
        for (VaoLido vao : vaos.values()) {
            ligacoes.computeIfAbsent(vao.a(), k -> new ArrayList<>()).add(vao.b());
            ligacoes.computeIfAbsent(vao.b(), k -> new ArrayList<>()).add(vao.a());
        }
        // Começa pela ponta da rede mais ao topo da folha; pontos soltos entram depois, na ordem de leitura.
        List<Lido> ordem = pontos.values().stream()
                .sorted(Comparator.<Lido>comparingInt(p -> ligacoes.getOrDefault(p.referencia(), List.of()).size() == 1 ? 0 : 1)
                        .thenComparingDouble(Lido::y)
                        .thenComparingDouble(Lido::x))
                .toList();
        Set<String> visitados = new LinkedHashSet<>();
        for (Lido inicio : ordem) {
            percorrer(inicio.referencia(), ligacoes, visitados);
        }
        for (String referencia : visitados) {
            if (pontos.containsKey(referencia) && !numeros.containsKey(referencia)) {
                numeros.put(referencia, String.valueOf(proximo++));
            }
        }
        return numeros;
    }

    private static void percorrer(String referencia, Map<String, List<String>> ligacoes, Set<String> visitados) {
        if (visitados.add(referencia)) {
            ligacoes.getOrDefault(referencia, List.of()).forEach(vizinho -> percorrer(vizinho, ligacoes, visitados));
        }
    }

    private String existente(String referencia) {
        return barramentosExistentes.getOrDefault(referencia, referencia);
    }

    /** Distância na folha convertida pela escala do carimbo; só entre pontos desta leitura, na mesma página. */
    private BigDecimal estimarMetragem(String a, String b) {
        Lido pa = pontos.get(a);
        Lido pb = pontos.get(b);
        if (escala == null || larguraPt <= 0 || pa == null || pb == null) {
            return null;
        }
        double distanciaPt = Math.hypot((pa.x() - pb.x()) * larguraPt, (pa.y() - pb.y()) * alturaPt);
        double metros = distanciaPt * METROS_POR_PONTO * escala;
        return metros > 0 ? BigDecimal.valueOf(metros).setScale(1, RoundingMode.HALF_UP) : null;
    }

    /**
     * Metros por ponto de PDF tirados das próprias cotas lidas (a mediana, para uma cota errada não puxar a conta).
     * Vale mais que a escala do carimbo: prancha impressa reduzida em A4 continua dizendo 1:1.000.
     */
    private Double proporcaoDasCotas() {
        List<Double> proporcoes = new ArrayList<>();
        for (VaoLido vao : vaos.values()) {
            Double distancia = distanciaPt(vao.a(), vao.b());
            if (vao.metragem() != null && distancia != null && distancia > 0) {
                proporcoes.add(vao.metragem().doubleValue() / distancia);
            }
        }
        if (proporcoes.size() < MINIMO_COTAS_PROPORCAO) {
            return null;
        }
        proporcoes.sort(Double::compareTo);
        return proporcoes.get(proporcoes.size() / 2);
    }

    /** Distância entre dois pontos desta leitura, em pontos de PDF; nula se algum não foi lido aqui. */
    private Double distanciaPt(String a, String b) {
        Lido pa = pontos.get(a);
        Lido pb = pontos.get(b);
        if (larguraPt <= 0 || pa == null || pb == null) {
            return null;
        }
        return Math.hypot((pa.x() - pb.x()) * larguraPt, (pa.y() - pb.y()) * alturaPt);
    }

    private boolean conhecido(String referencia) {
        return pontos.containsKey(referencia) || numerosExistentes.contains(referencia);
    }

    private String identificador(JsonNode no) {
        String id = texto(no, "id");
        if (id != null && pontos.containsKey(id.toUpperCase(Locale.ROOT))) {
            return id.toUpperCase(Locale.ROOT);
        }
        String numero = texto(no, "numero");
        if (numero != null && numero.length() <= 20) {
            return referencia(numero);
        }
        String barramento = texto(no, "barramento");
        return barramento != null && barramento.length() <= 20 ? referencia(barramento) : null;
    }

    private void juntarCaixa(String caixa, String dono, String numero) {
        Lido daCaixa = pontos.remove(caixa);
        Lido ponto = pontos.get(dono);
        Set<String> textos = new LinkedHashSet<>(ponto.textos());
        textos.addAll(daCaixa.textos());
        String numeroFinal = ponto.numero() != null ? ponto.numero()
                : numero != null ? referencia(numero) : daCaixa.numero();
        pontos.put(dono, new Lido(dono, numeroFinal, ponto.tipo(), ponto.x(), ponto.y(), ponto.barramento(),
                List.copyOf(textos), ponto.confianca(), ponto.daCamada()));
        caixasUnidas.put(caixa, dono);
    }

    /** O vão pode citar a caixa, ou o número escrito no balão, em vez do código do ponto. */
    private String resolverReferencia(String texto) {
        String referencia = referencia(texto);
        String dono = caixasUnidas.get(referencia);
        if (dono != null) {
            return dono;
        }
        if (pontos.containsKey(referencia)) {
            return referencia;
        }
        return pontos.values().stream()
                .filter(p -> referencia.equals(p.numero()))
                .map(Lido::referencia)
                .findFirst()
                .orElse(referencia);
    }

    /** "03" e "3" são o mesmo ponto. */
    private static String referencia(String texto) {
        String normal = PontoPlanejamento.normalizarNumero(texto);
        return normal.matches("0+\\d+") ? normal.replaceFirst("^0+", "") : normal;
    }

    private static int compararNumero(String a, String b) {
        boolean numericoA = a.matches("\\d{1,9}");
        boolean numericoB = b.matches("\\d{1,9}");
        if (numericoA && numericoB) {
            return Integer.compare(Integer.parseInt(a), Integer.parseInt(b));
        }
        return numericoA ? -1 : numericoB ? 1 : a.compareTo(b);
    }

    /** O kit só vem marcado quando o texto lido aponta para um único kit do catálogo. */
    private List<KitSugerido> kits(List<String> textos, boolean paraVao) {
        Map<UUID, KitSugerido> achados = new LinkedHashMap<>();
        for (String texto : textos) {
            if (TROCA.equals(texto) || A_RETIRAR.equals(texto)) {
                continue;
            }
            for (String termo : termos(texto, paraVao)) {
                List<KitCatalogo> candidatos = catalogo.stream()
                        .filter(k -> paraVao == kitDeVao(k))
                        .filter(k -> casa(k, termo))
                        .sorted(Comparator.comparing(KitCatalogo::codigo))
                        .toList();
                boolean unico = candidatos.size() == 1;
                if (candidatos.isEmpty() && !paraVao) {
                    // Estrutura com sufixo da folha (N1M, S1-T) e kit com o código-base (N1, S1): sugere sem marcar.
                    candidatos = catalogo.stream()
                            .filter(k -> !kitDeVao(k) && kitDeEstrutura(k))
                            .filter(k -> normalizar(k.codigo()).length() >= 2 && termo.startsWith(normalizar(k.codigo())))
                            .sorted(Comparator.comparing(KitCatalogo::codigo))
                            .toList();
                    unico = false;
                }
                boolean marcado = unico;
                candidatos.stream().limit(MAXIMO_KITS_POR_TEXTO).forEach(k -> achados.putIfAbsent(k.id(),
                        new KitSugerido(k.id(), k.codigo(), k.descricao(), texto, marcado)));
            }
        }
        return List.copyOf(achados.values());
    }

    /**
     * O termo lido casa com um termo inteiro do código ou da descrição do kit ("IM-1" com "(IM-1)", "N1" com "N1 - CCT").
     * Trecho no meio de outra palavra só vale para termos longos: "IT-R" não pode casar dentro de "KIT-RET-01".
     */
    private static boolean casa(KitCatalogo kit, String termo) {
        String texto = kit.codigo() + " " + kit.descricao();
        for (String parte : SEPARADOR_TERMOS.split(texto)) {
            if (!parte.isBlank() && normalizar(parte).equals(termo)) {
                return true;
            }
        }
        return termo.length() >= TERMO_LONGO && normalizar(texto).contains(termo);
    }

    private static boolean kitDeEstrutura(KitCatalogo kit) {
        return normalizar(kit.grupo() != null ? kit.grupo() : "").startsWith("ESTRUTURA");
    }

    private static boolean kitDeVao(KitCatalogo kit) {
        String grupo = normalizar(kit.grupo() != null ? kit.grupo() : "");
        return grupo.startsWith("VAO") || normalizar(kit.descricao()).contains("CABO");
    }

    private static List<String> termos(String texto, boolean paraVao) {
        if (paraVao) {
            Matcher bitola = BITOLA.matcher(texto);
            Set<String> bitolas = new LinkedHashSet<>();
            while (bitola.find()) {
                bitolas.add(normalizar(bitola.group()));
            }
            if (!bitolas.isEmpty()) {
                return List.of(bitolas.iterator().next());
            }
            // "3#35(35)": três fases de 35 mm², como o catálogo escreve "3x1x35".
            Matcher fases = FASES.matcher(texto);
            if (fases.find()) {
                return List.of(fases.group(1) + "X1X" + fases.group(2));
            }
        }
        String termo = normalizar(texto);
        return termo.length() >= 2 ? List.of(termo) : List.of();
    }

    static String normalizar(String texto) {
        return Normalizer.normalize(texto, Normalizer.Form.NFD)
                .replace('×', 'X')
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]", "");
    }

    private static Lido unir(Lido atual, Lido outro) {
        Set<String> textos = new LinkedHashSet<>(atual.textos());
        textos.addAll(outro.textos());
        // Mesmo ponto com um balão riscado e outro não: a estrutura existente sai e a nova entra no lugar.
        boolean umSai = atual.textos().contains(A_RETIRAR) != outro.textos().contains(A_RETIRAR);
        if (umSai) {
            textos.remove(A_RETIRAR);
            textos.add(TROCA);
        }
        if (atual.daCamada()) {
            // O texto do PDF é exato. Do modelo vêm o tipo e a posição do símbolo, desde que perto da etiqueta.
            boolean perto = Math.hypot(atual.x() - outro.x(), atual.y() - outro.y()) <= ALCANCE_SIMBOLO;
            return new Lido(atual.referencia(), atual.numero() != null ? atual.numero() : outro.numero(), outro.tipo(), perto ? outro.x() : atual.x(),
                    perto ? outro.y() : atual.y(), atual.barramento(), List.copyOf(textos), atual.confianca(), true);
        }
        Lido base = outro.confianca() > atual.confianca() ? outro : atual;
        String barramento = base.barramento() != null ? base.barramento()
                : atual.barramento() != null ? atual.barramento() : outro.barramento();
        return new Lido(base.referencia(), base.numero(), base.tipo(), base.x(), base.y(), barramento, List.copyOf(textos),
                base.confianca(), false);
    }

    /** Pode ser chamado de várias threads: só confere se a resposta é o JSON esperado. */
    static boolean respostaValida(String resposta) {
        return lerJson(resposta) != null;
    }

    private static JsonNode lerJson(String resposta) {
        if (resposta == null) {
            return null;
        }
        int inicio = resposta.indexOf('{');
        int fim = resposta.lastIndexOf('}');
        if (inicio < 0 || fim <= inicio) {
            return null;
        }
        try {
            return JSON.readTree(resposta.substring(inicio, fim + 1));
        } catch (Exception e) {
            return null;
        }
    }

    private static String texto(JsonNode no, String campo) {
        JsonNode valor = no.path(campo);
        if (valor.isMissingNode() || valor.isNull()) {
            return null;
        }
        String texto = valor.asText("").trim();
        return texto.isEmpty() ? null : texto;
    }

    private static void adicionar(List<String> textos, String texto) {
        if (texto != null && !texto.isBlank() && !textos.contains(texto.trim())) {
            textos.add(texto.trim());
        }
    }

    private static TipoPontoPlanejamento tipo(String texto) {
        if (texto == null) {
            return TipoPontoPlanejamento.POSTE;
        }
        try {
            return TipoPontoPlanejamento.valueOf(texto.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return TipoPontoPlanejamento.OUTRO;
        }
    }

    private static BigDecimal metragem(JsonNode no) {
        if (no.isNumber() && no.asDouble() > 0) {
            return no.decimalValue().setScale(2, RoundingMode.HALF_UP);
        }
        if (no.isTextual()) {
            try {
                BigDecimal valor = new BigDecimal(no.asText().replace(",", ".").replaceAll("[^0-9.]", ""));
                return valor.signum() > 0 ? valor.setScale(2, RoundingMode.HALF_UP) : null;
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private static BigDecimal coordenada(double valor) {
        return BigDecimal.valueOf(valor).setScale(6, RoundingMode.HALF_UP);
    }

    private static double limitar(double valor) {
        return Math.max(0d, Math.min(1d, valor));
    }
}
