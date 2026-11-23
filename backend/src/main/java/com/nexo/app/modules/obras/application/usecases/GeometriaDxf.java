package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.usecases.ArquivoDxf.Par;

import java.awt.geom.AffineTransform;
import java.awt.geom.Point2D;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * O desenho do DXF para ser plotado: linhas, polilinhas, arcos, círculos, sólidos e textos, com os símbolos dos blocos
 * já expandidos nas posições onde foram inseridos e a cor resolvida (da entidade, do bloco ou da camada). Coordenadas
 * em unidades do desenho (nos projetos de rede, metros UTM).
 */
final class GeometriaDxf {

    /** Blocos dentro de blocos: além disso o arquivo está em laço ou malformado. */
    private static final int PROFUNDIDADE_MAXIMA = 8;
    private static final int SEGMENTOS_CIRCULO = 36;
    /** Cor 7 do AutoCAD é "preto no fundo branco". */
    static final int PRETO = 0x000000;

    /** Traço ou área preenchida (sólido). */
    record Forma(String camada, int cor, List<double[]> pontos, boolean preenchida) {
    }

    /**
     * @param ancoraHorizontal 0 no começo do texto, 0,5 no meio, 1 no fim
     * @param ancoraVertical   0 na linha de base, 0,5 no meio, 1 no topo
     */
    record TextoDesenho(String camada, int cor, String texto, double x, double y, double altura, double rotacao,
                        double ancoraHorizontal, double ancoraVertical) {
    }

    record Desenho(List<Forma> formas, List<TextoDesenho> textos) {
    }

    private record Entidade(String tipo, List<Par> grupo, List<List<Par>> filhos) {
    }

    private record Bloco(double baseX, double baseY, List<Entidade> entidades) {
    }

    private final Map<String, Integer> coresDasCamadas = new HashMap<>();
    private final Map<String, Bloco> blocos = new HashMap<>();
    private final List<Forma> formas = new ArrayList<>();
    private final List<TextoDesenho> textos = new ArrayList<>();

    private GeometriaDxf() {
    }

    static Desenho ler(byte[] conteudo) {
        List<Par> pares = ArquivoDxf.lerPares(conteudo);
        GeometriaDxf g = new GeometriaDxf();
        g.lerCamadas(pares);
        g.lerBlocos(pares);
        int entidades = ArquivoDxf.indiceSecao(pares, "ENTITIES");
        if (entidades >= 0) {
            for (Entidade e : entidadesAte(pares, entidades, "ENDSEC")) {
                g.desenhar(e, new AffineTransform(), null, 0);
            }
        }
        return new Desenho(List.copyOf(g.formas), List.copyOf(g.textos));
    }

    // ---- leitura das seções ----

    /** Tabela de camadas: cor de cada uma (cor negativa = camada desligada, que não é plotada). */
    private void lerCamadas(List<Par> pares) {
        int i = ArquivoDxf.indiceSecao(pares, "TABLES");
        if (i < 0) {
            return;
        }
        while (i < pares.size() && !(pares.get(i).codigo() == 0 && "ENDSEC".equals(pares.get(i).valor()))) {
            if (pares.get(i).codigo() == 0 && "LAYER".equals(pares.get(i).valor())) {
                int fim = ArquivoDxf.proximaEntidade(pares, i + 1);
                List<Par> grupo = pares.subList(i + 1, fim);
                String nome = ArquivoDxf.valor(grupo, 2, null);
                if (nome != null) {
                    coresDasCamadas.put(nome.toUpperCase(Locale.ROOT), ArquivoDxf.inteiro(grupo, 62));
                }
                i = fim;
            } else {
                i++;
            }
        }
    }

    private void lerBlocos(List<Par> pares) {
        int i = ArquivoDxf.indiceSecao(pares, "BLOCKS");
        if (i < 0) {
            return;
        }
        while (i < pares.size() && !(pares.get(i).codigo() == 0 && "ENDSEC".equals(pares.get(i).valor()))) {
            if (pares.get(i).codigo() == 0 && "BLOCK".equals(pares.get(i).valor())) {
                int fim = ArquivoDxf.proximaEntidade(pares, i + 1);
                List<Par> cabecalho = pares.subList(i + 1, fim);
                List<Entidade> conteudo = entidadesAte(pares, fim, "ENDBLK");
                String nome = ArquivoDxf.valor(cabecalho, 2, "");
                blocos.put(nome.toUpperCase(Locale.ROOT), new Bloco(ArquivoDxf.numero(cabecalho, 10), ArquivoDxf.numero(cabecalho, 20), conteudo));
                // Pula até depois do ENDBLK.
                i = fim;
                while (i < pares.size() && !(pares.get(i).codigo() == 0 && "ENDBLK".equals(pares.get(i).valor()))) {
                    i++;
                }
                i++;
            } else {
                i++;
            }
        }
    }

    /** Entidades a partir de {@code inicio} até o marcador; vértices e atributos ficam como filhos da entidade-mãe. */
    private static List<Entidade> entidadesAte(List<Par> pares, int inicio, String marcadorFim) {
        List<Entidade> entidades = new ArrayList<>();
        int i = inicio;
        while (i < pares.size()) {
            Par p = pares.get(i);
            if (p.codigo() != 0) {
                i++;
                continue;
            }
            if (marcadorFim.equals(p.valor()) || "ENDSEC".equals(p.valor())) {
                break;
            }
            int fim = ArquivoDxf.proximaEntidade(pares, i + 1);
            List<Par> grupo = pares.subList(i + 1, fim);
            List<List<Par>> filhos = new ArrayList<>();
            boolean comFilhos = "POLYLINE".equals(p.valor()) || ("INSERT".equals(p.valor()) && ArquivoDxf.inteiro(grupo, 66) == 1);
            if (comFilhos) {
                while (fim < pares.size() && ("VERTEX".equals(pares.get(fim).valor()) || "ATTRIB".equals(pares.get(fim).valor()))) {
                    int fimFilho = ArquivoDxf.proximaEntidade(pares, fim + 1);
                    filhos.add(pares.subList(fim + 1, fimFilho));
                    fim = fimFilho;
                }
                if (fim < pares.size() && "SEQEND".equals(pares.get(fim).valor())) {
                    fim = ArquivoDxf.proximaEntidade(pares, fim + 1);
                }
            }
            entidades.add(new Entidade(p.valor(), grupo, filhos));
            i = fim;
        }
        return entidades;
    }

    // ---- desenho ----

    /**
     * @param corDoBloco cor herdada quando a entidade está "por bloco" (cor 0), ou nula fora de bloco
     */
    private void desenhar(Entidade e, AffineTransform t, Integer corDoBloco, int profundidade) {
        String camada = ArquivoDxf.valor(e.grupo(), 8, "0");
        Integer cor = cor(e.grupo(), camada, corDoBloco);
        if (cor == null) {
            return;
        }
        switch (e.tipo()) {
            case "LINE" -> forma(camada, cor, t, false,
                    ponto(e.grupo(), 10, 20), ponto(e.grupo(), 11, 21));
            case "LWPOLYLINE" -> {
                List<double[]> pontos = new ArrayList<>();
                Double x = null;
                for (Par p : e.grupo()) {
                    if (p.codigo() == 10) {
                        x = Double.parseDouble(p.valor().trim());
                    } else if (p.codigo() == 20 && x != null) {
                        pontos.add(new double[]{x, Double.parseDouble(p.valor().trim())});
                        x = null;
                    }
                }
                fechar(pontos, ArquivoDxf.inteiro(e.grupo(), 70));
                forma(camada, cor, t, false, pontos.toArray(double[][]::new));
            }
            case "POLYLINE" -> {
                List<double[]> pontos = new ArrayList<>();
                e.filhos().forEach(v -> pontos.add(ponto(v, 10, 20)));
                fechar(pontos, ArquivoDxf.inteiro(e.grupo(), 70));
                forma(camada, cor, t, false, pontos.toArray(double[][]::new));
            }
            case "CIRCLE" -> forma(camada, cor, t, false, arco(e.grupo(), 0, 360));
            case "ARC" -> forma(camada, cor, t, false,
                    arco(e.grupo(), ArquivoDxf.numero(e.grupo(), 50), ArquivoDxf.numero(e.grupo(), 51)));
            case "SOLID", "TRACE" -> forma(camada, cor, t, true,
                    // A ordem dos cantos do SOLID é 1, 2, 4, 3.
                    ponto(e.grupo(), 10, 20), ponto(e.grupo(), 11, 21), ponto(e.grupo(), 13, 23), ponto(e.grupo(), 12, 22));
            case "TEXT" -> texto(camada, cor, t, e.grupo(), false);
            case "MTEXT" -> texto(camada, cor, t, e.grupo(), true);
            case "INSERT" -> inserir(e, t, cor, profundidade);
            default -> {
                // Hachuras, cotas, pontos e afins não entram na planta.
            }
        }
    }

    private void inserir(Entidade e, AffineTransform t, int cor, int profundidade) {
        for (List<Par> atributo : e.filhos()) {
            // Atributos (ex.: código do poste) já vêm na posição final.
            String camada = ArquivoDxf.valor(atributo, 8, "0");
            Integer corAtributo = cor(atributo, camada, cor);
            if (corAtributo != null && (ArquivoDxf.inteiro(atributo, 70) & 1) == 0) {
                texto(camada, corAtributo, t, atributo, false);
            }
        }
        Bloco bloco = blocos.get(ArquivoDxf.valor(e.grupo(), 2, "").toUpperCase(Locale.ROOT));
        if (bloco == null || profundidade >= PROFUNDIDADE_MAXIMA) {
            return;
        }
        double sx = e.grupo().stream().anyMatch(p -> p.codigo() == 41) ? ArquivoDxf.numero(e.grupo(), 41) : 1;
        double sy = e.grupo().stream().anyMatch(p -> p.codigo() == 42) ? ArquivoDxf.numero(e.grupo(), 42) : 1;
        AffineTransform local = new AffineTransform(t);
        local.translate(ArquivoDxf.numero(e.grupo(), 10), ArquivoDxf.numero(e.grupo(), 20));
        local.rotate(Math.toRadians(ArquivoDxf.numero(e.grupo(), 50)));
        local.scale(sx == 0 ? 1 : sx, sy == 0 ? 1 : sy);
        local.translate(-bloco.baseX(), -bloco.baseY());
        for (Entidade filha : bloco.entidades()) {
            desenhar(filha, local, cor, profundidade + 1);
        }
    }

    /**
     * Cor RGB da entidade: a própria (62), a do bloco (0 = por bloco) ou a da camada (256 ou ausente = por camada).
     * Nula quando a camada está desligada.
     */
    private Integer cor(List<Par> grupo, String camada, Integer corDoBloco) {
        boolean temCor = grupo.stream().anyMatch(p -> p.codigo() == 62);
        int indice = temCor ? ArquivoDxf.inteiro(grupo, 62) : 256;
        if (indice == 0) {
            return corDoBloco != null ? corDoBloco : PRETO;
        }
        if (indice == 256) {
            Integer daCamada = coresDasCamadas.get(camada.toUpperCase(Locale.ROOT));
            if (daCamada != null && daCamada < 0) {
                return null;
            }
            indice = daCamada == null ? 7 : daCamada;
        }
        return rgb(Math.abs(indice));
    }

    /** Índice de cor do AutoCAD em RGB, escurecendo as cores claras demais para papel branco. */
    static int rgb(int indice) {
        return switch (indice) {
            case 1 -> 0xE00000;
            case 2 -> 0xB89A00;
            case 3 -> 0x008A00;
            case 4 -> 0x008A8A;
            case 5 -> 0x0000E0;
            case 6 -> 0xD000D0;
            case 8 -> 0x707070;
            case 9 -> 0xA0A0A0;
            case 7 -> PRETO;
            default -> 0x505050;
        };
    }

    private void forma(String camada, int cor, AffineTransform t, boolean preenchida, double[]... pontos) {
        if (pontos.length < 2) {
            return;
        }
        List<double[]> transformados = new ArrayList<>(pontos.length);
        for (double[] p : pontos) {
            Point2D q = t.transform(new Point2D.Double(p[0], p[1]), null);
            transformados.add(new double[]{q.getX(), q.getY()});
        }
        formas.add(new Forma(camada, cor, transformados, preenchida));
    }

    private void texto(String camada, int cor, AffineTransform t, List<Par> grupo, boolean multilinha) {
        String conteudo;
        double x;
        double y;
        double rotacao;
        double ancoraH;
        double ancoraV;
        if (multilinha) {
            StringBuilder texto = new StringBuilder();
            grupo.stream().filter(p -> p.codigo() == 3).forEach(p -> texto.append(p.valor()));
            texto.append(ArquivoDxf.valor(grupo, 1, ""));
            conteudo = texto.toString().replaceAll("\\\\[Pp]", " ").replaceAll("\\\\[A-OQ-Za-oq-z][^;\\\\{}]*;", "")
                    .replace("{", "").replace("}", "");
            x = ArquivoDxf.numero(grupo, 10);
            y = ArquivoDxf.numero(grupo, 20);
            rotacao = ArquivoDxf.numero(grupo, 50);
            int fixacao = Math.max(1, ArquivoDxf.inteiro(grupo, 71));
            ancoraH = ((fixacao - 1) % 3) / 2.0;
            ancoraV = 1 - ((fixacao - 1) / 3) / 2.0;
        } else {
            conteudo = ArquivoDxf.valor(grupo, 1, "");
            int h = ArquivoDxf.inteiro(grupo, 72);
            int v = ArquivoDxf.inteiro(grupo, 73);
            boolean justificado = (h != 0 || v != 0) && grupo.stream().anyMatch(p -> p.codigo() == 11);
            x = ArquivoDxf.numero(grupo, justificado ? 11 : 10);
            y = ArquivoDxf.numero(grupo, justificado ? 21 : 20);
            rotacao = ArquivoDxf.numero(grupo, 50);
            ancoraH = !justificado ? 0 : h == 2 ? 1 : h == 0 ? 0 : 0.5;
            ancoraV = h == 4 ? 0.5 : v == 2 ? 0.5 : v == 3 ? 1 : 0;
        }
        String limpo = ArquivoDxf.limparTexto(conteudo);
        if (limpo.isBlank()) {
            return;
        }
        Point2D p = t.transform(new Point2D.Double(x, y), null);
        // Escala e giro do bloco valem para o texto também.
        double escala = Math.sqrt(Math.abs(t.getDeterminant()));
        double giro = Math.toDegrees(Math.atan2(t.getShearY(), t.getScaleX()));
        textos.add(new TextoDesenho(camada, cor, limpo, p.getX(), p.getY(), ArquivoDxf.numero(grupo, 40) * escala,
                rotacao + giro, ancoraH, ancoraV));
    }

    private static double[] ponto(List<Par> grupo, int cx, int cy) {
        return new double[]{ArquivoDxf.numero(grupo, cx), ArquivoDxf.numero(grupo, cy)};
    }

    private static void fechar(List<double[]> pontos, int marcador) {
        if ((marcador & 1) == 1 && !pontos.isEmpty()) {
            pontos.add(pontos.getFirst());
        }
    }

    /** Arco (ou círculo) em segmentos de reta, no sentido anti-horário de {@code inicio} a {@code fim}. */
    private static double[][] arco(List<Par> grupo, double inicio, double fim) {
        double cx = ArquivoDxf.numero(grupo, 10);
        double cy = ArquivoDxf.numero(grupo, 20);
        double r = ArquivoDxf.numero(grupo, 40);
        double varredura = fim - inicio;
        while (varredura <= 0) {
            varredura += 360;
        }
        int n = Math.max(4, (int) Math.ceil(SEGMENTOS_CIRCULO * varredura / 360));
        double[][] pontos = new double[n + 1][];
        for (int k = 0; k <= n; k++) {
            double a = Math.toRadians(inicio + varredura * k / n);
            pontos[k] = new double[]{cx + r * Math.cos(a), cy + r * Math.sin(a)};
        }
        return pontos;
    }
}
