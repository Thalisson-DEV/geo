package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lê um DXF em texto (do R12 ao 2018+) e devolve só o que a leitura de projeto usa, das entidades soltas no desenho
 * (seção ENTITIES): textos, linhas e polilinhas, e blocos inseridos com os atributos. Coordenadas ficam como estão no
 * arquivo — nos projetos de rede, em metros UTM.
 *
 * <p>Não depende de biblioteca: o formato é uma sequência de pares "código de grupo / valor", documentada pela Autodesk.</p>
 */
final class ArquivoDxf {

    private static final String SENTINELA_BINARIO = "AutoCAD Binary DXF";
    private static final Pattern UNICODE = Pattern.compile("\\\\U\\+([0-9A-Fa-f]{4})");
    private static final Pattern VERSAO = Pattern.compile("\\$ACADVER\\s*\\r?\\n\\s*1\\s*\\r?\\n\\s*AC(\\d{4})");
    private static final Pattern CODEPAGE = Pattern.compile("\\$DWGCODEPAGE\\s*\\r?\\n\\s*3\\s*\\r?\\n\\s*(\\S+)");
    /** Primeira versão em que o DXF passou a ser sempre UTF-8 (AutoCAD 2007). */
    private static final int VERSAO_UTF8 = 1021;

    /**
     * @param x         ponto de inserção, ou o de alinhamento quando o texto é justificado (é ele que fica no lugar)
     * @param rotacao   graus, anti-horário
     * @param ancora    onde o ponto fica na largura do texto: 0 no começo, 0,5 no meio, 1 no fim
     */
    record Texto(String camada, String texto, double x, double y, double altura, double rotacao, double ancora) {
    }

    /** Linha ou polilinha: os vértices na ordem do desenho. */
    record Traco(String camada, List<double[]> vertices) {
    }

    record Insercao(String camada, String bloco, double x, double y, double rotacao, Map<String, String> atributos) {
    }

    record Desenho(List<Texto> textos, List<Traco> tracos, List<Insercao> insercoes) {
    }

    record Par(int codigo, String valor) {
    }

    private ArquivoDxf() {
    }

    static Desenho ler(byte[] conteudo) {
        return interpretar(lerPares(conteudo));
    }

    /** Pares código/valor do arquivo inteiro, já decodificados; recusa DXF binário e o que não é DXF. */
    static List<Par> lerPares(byte[] conteudo) {
        String inicio = new String(conteudo, 0, Math.min(conteudo.length, 32), StandardCharsets.ISO_8859_1);
        if (inicio.startsWith(SENTINELA_BINARIO)) {
            throw new InvarianteVioladaException("O DXF está no formato binário. Salve como DXF em texto (ASCII) e envie de novo.");
        }
        String texto = decodificar(conteudo);
        if (!texto.contains("SECTION")) {
            throw new InvarianteVioladaException("O arquivo não é um DXF válido.");
        }
        return pares(texto);
    }

    /**
     * Do AutoCAD 2007 em diante o DXF é UTF-8. Antes, vale a página de código do cabeçalho, mas há programas que gravam
     * UTF-8 mesmo dizendo ANSI_1252: se o conteúdo é UTF-8 válido, fica UTF-8.
     */
    static String decodificar(byte[] conteudo) {
        String ascii = new String(conteudo, 0, Math.min(conteudo.length, 4096), StandardCharsets.ISO_8859_1);
        Matcher versao = VERSAO.matcher(ascii);
        boolean utf8Declarado = versao.find() && Integer.parseInt(versao.group(1)) >= VERSAO_UTF8;
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(conteudo)).toString();
        } catch (CharacterCodingException e) {
            if (utf8Declarado) {
                return new String(conteudo, StandardCharsets.UTF_8);
            }
            Matcher pagina = CODEPAGE.matcher(ascii);
            return new String(conteudo, charset(pagina.find() ? pagina.group(1) : null));
        }
    }

    private static Charset charset(String paginaDeCodigo) {
        String nome = paginaDeCodigo == null ? "" : paginaDeCodigo.toUpperCase(Locale.ROOT);
        try {
            if (nome.startsWith("ANSI_")) {
                return Charset.forName("windows-" + nome.substring(5));
            }
            if (nome.startsWith("DOS")) {
                return Charset.forName("IBM" + nome.substring(3));
            }
        } catch (RuntimeException e) {
            // Página desconhecida: cai no padrão do Windows ocidental.
        }
        return Charset.forName("windows-1252");
    }

    private static List<Par> pares(String texto) {
        String[] linhas = texto.split("\\r?\\n", -1);
        List<Par> pares = new ArrayList<>(linhas.length / 2);
        for (int i = 0; i + 1 < linhas.length; i += 2) {
            String codigo = linhas[i].trim();
            if (codigo.isEmpty()) {
                // Linha em branco perdida (fim de arquivo): o alinhamento código/valor acabou.
                break;
            }
            try {
                pares.add(new Par(Integer.parseInt(codigo), stripFinal(linhas[i + 1])));
            } catch (NumberFormatException e) {
                throw new InvarianteVioladaException("O DXF está corrompido perto da linha " + (i + 1) + ".");
            }
        }
        return pares;
    }

    private static String stripFinal(String valor) {
        int fim = valor.length();
        while (fim > 0 && Character.isWhitespace(valor.charAt(fim - 1))) {
            fim--;
        }
        return valor.substring(0, fim);
    }

    /** Percorre a seção ENTITIES; cada entidade vai do seu código 0 até o próximo. */
    private static Desenho interpretar(List<Par> pares) {
        List<Texto> textos = new ArrayList<>();
        List<Traco> tracos = new ArrayList<>();
        List<Insercao> insercoes = new ArrayList<>();
        int i = indiceSecao(pares, "ENTITIES");
        if (i < 0) {
            return new Desenho(textos, tracos, insercoes);
        }
        while (i < pares.size()) {
            Par inicio = pares.get(i);
            if (inicio.codigo() == 0 && "ENDSEC".equals(inicio.valor())) {
                break;
            }
            int fim = proximaEntidade(pares, i + 1);
            List<Par> grupo = pares.subList(i + 1, fim);
            switch (inicio.valor()) {
                case "TEXT" -> textos.add(texto(grupo));
                case "MTEXT" -> textos.add(textoMultilinha(grupo));
                case "LINE" -> tracos.add(new Traco(valor(grupo, 8, "0"),
                        List.of(new double[]{numero(grupo, 10), numero(grupo, 20)}, new double[]{numero(grupo, 11), numero(grupo, 21)})));
                case "LWPOLYLINE" -> tracos.add(polilinhaLeve(grupo));
                case "POLYLINE" -> {
                    // Vértices vêm em entidades VERTEX até o SEQEND.
                    List<double[]> vertices = new ArrayList<>();
                    int j = fim;
                    while (j < pares.size() && "VERTEX".equals(pares.get(j).valor())) {
                        int fimVertice = proximaEntidade(pares, j + 1);
                        List<Par> v = pares.subList(j + 1, fimVertice);
                        vertices.add(new double[]{numero(v, 10), numero(v, 20)});
                        j = fimVertice;
                    }
                    if (j < pares.size() && "SEQEND".equals(pares.get(j).valor())) {
                        j = proximaEntidade(pares, j + 1);
                    }
                    if ((inteiro(grupo, 70) & 1) == 1 && !vertices.isEmpty()) {
                        vertices.add(vertices.getFirst());
                    }
                    tracos.add(new Traco(valor(grupo, 8, "0"), vertices));
                    fim = j;
                }
                case "INSERT" -> {
                    Map<String, String> atributos = new LinkedHashMap<>();
                    int j = fim;
                    if (inteiro(grupo, 66) == 1) {
                        while (j < pares.size() && "ATTRIB".equals(pares.get(j).valor())) {
                            int fimAtributo = proximaEntidade(pares, j + 1);
                            List<Par> a = pares.subList(j + 1, fimAtributo);
                            atributos.put(valor(a, 2, "").toUpperCase(Locale.ROOT), limparTexto(valor(a, 1, "")));
                            j = fimAtributo;
                        }
                        if (j < pares.size() && "SEQEND".equals(pares.get(j).valor())) {
                            j = proximaEntidade(pares, j + 1);
                        }
                    }
                    insercoes.add(new Insercao(valor(grupo, 8, "0"), valor(grupo, 2, ""), numero(grupo, 10), numero(grupo, 20),
                            numero(grupo, 50), atributos));
                    fim = j;
                }
                default -> {
                    // Demais entidades (arcos, círculos, hachuras) não entram na leitura do projeto.
                }
            }
            i = fim;
        }
        return new Desenho(textos, tracos, insercoes);
    }

    static int indiceSecao(List<Par> pares, String nome) {
        for (int i = 0; i + 1 < pares.size(); i++) {
            if (pares.get(i).codigo() == 0 && "SECTION".equals(pares.get(i).valor())
                    && pares.get(i + 1).codigo() == 2 && nome.equals(pares.get(i + 1).valor())) {
                return i + 2;
            }
        }
        return -1;
    }

    static int proximaEntidade(List<Par> pares, int de) {
        int i = de;
        while (i < pares.size() && pares.get(i).codigo() != 0) {
            i++;
        }
        return i;
    }

    /** Texto justificado (72 ou 73 diferentes de zero) fica no ponto de alinhamento, não no de inserção. */
    private static Texto texto(List<Par> grupo) {
        boolean justificado = inteiro(grupo, 72) != 0 || inteiro(grupo, 73) != 0;
        boolean temAlinhamento = grupo.stream().anyMatch(p -> p.codigo() == 11);
        double x = justificado && temAlinhamento ? numero(grupo, 11) : numero(grupo, 10);
        double y = justificado && temAlinhamento ? numero(grupo, 21) : numero(grupo, 20);
        int horizontal = inteiro(grupo, 72);
        double ancora = !justificado || !temAlinhamento ? 0 : horizontal == 2 ? 1 : horizontal == 0 ? 0 : 0.5;
        return new Texto(valor(grupo, 8, "0"), limparTexto(valor(grupo, 1, "")), x, y, numero(grupo, 40), numero(grupo, 50), ancora);
    }

    /** MTEXT: o texto vem em pedaços (3, 3, ..., 1) e com códigos de formatação no meio. */
    private static Texto textoMultilinha(List<Par> grupo) {
        StringBuilder texto = new StringBuilder();
        grupo.stream().filter(p -> p.codigo() == 3).forEach(p -> texto.append(p.valor()));
        texto.append(valor(grupo, 1, ""));
        String limpo = texto.toString()
                .replaceAll("\\\\[Pp]", " ")
                .replaceAll("\\\\[A-OQ-Za-oq-z][^;\\\\{}]*;", "")
                .replace("{", "").replace("}", "");
        double rotacao = grupo.stream().anyMatch(p -> p.codigo() == 50) ? numero(grupo, 50)
                : Math.toDegrees(Math.atan2(numero(grupo, 21), numero(grupo, 11) == 0 ? 1 : numero(grupo, 11)));
        int fixacao = Math.max(1, inteiro(grupo, 71));
        double ancora = ((fixacao - 1) % 3) / 2.0;
        return new Texto(valor(grupo, 8, "0"), limparTexto(limpo), numero(grupo, 10), numero(grupo, 20), numero(grupo, 40), rotacao, ancora);
    }

    private static Traco polilinhaLeve(List<Par> grupo) {
        List<double[]> vertices = new ArrayList<>();
        Double x = null;
        for (Par p : grupo) {
            if (p.codigo() == 10) {
                x = Double.parseDouble(p.valor().trim());
            } else if (p.codigo() == 20 && x != null) {
                vertices.add(new double[]{x, Double.parseDouble(p.valor().trim())});
                x = null;
            }
        }
        if ((inteiro(grupo, 70) & 1) == 1 && !vertices.isEmpty()) {
            vertices.add(vertices.getFirst());
        }
        return new Traco(valor(grupo, 8, "0"), vertices);
    }

    /** Códigos de controle do AutoCAD: %%c (diâmetro), %%d (grau), %%p (mais ou menos), %%u/%%o (sublinhado) e \U+XXXX. */
    static String limparTexto(String texto) {
        String t = texto.replace("%%c", "Ø").replace("%%C", "Ø")
                .replace("%%d", "°").replace("%%D", "°")
                .replace("%%p", "±").replace("%%P", "±")
                .replace("%%u", "").replace("%%U", "").replace("%%o", "").replace("%%O", "");
        Matcher u = UNICODE.matcher(t);
        StringBuilder saida = new StringBuilder();
        while (u.find()) {
            u.appendReplacement(saida, Matcher.quoteReplacement(String.valueOf((char) Integer.parseInt(u.group(1), 16))));
        }
        u.appendTail(saida);
        return saida.toString().trim();
    }

    static String valor(List<Par> grupo, int codigo, String padrao) {
        for (Par p : grupo) {
            if (p.codigo() == codigo) {
                return p.valor();
            }
        }
        return padrao;
    }

    static double numero(List<Par> grupo, int codigo) {
        String v = valor(grupo, codigo, null);
        if (v == null || v.isBlank()) {
            return 0;
        }
        try {
            return Double.parseDouble(v.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static int inteiro(List<Par> grupo, int codigo) {
        return (int) numero(grupo, codigo);
    }
}
