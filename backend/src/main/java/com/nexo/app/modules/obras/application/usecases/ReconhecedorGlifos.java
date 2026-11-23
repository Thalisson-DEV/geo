package com.nexo.app.modules.obras.application.usecases;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Lê o texto que o programa de projeto exportou como polígonos (uma forma preenchida por letra). Junta as letras em
 * linhas, acha o ângulo da linha, compara cada letra com os modelos e, no fim, faz a folha "votar": o mesmo desenho de
 * letra aparece dezenas de vezes, e a leitura da maioria corrige os erros isolados. Não depende de IA nem de rede.
 */
final class ReconhecedorGlifos {

    /** Lado do quadro em que letra e modelo são comparados. */
    private static final int R = 28;
    /** Altura do quadro em relação à altura das maiúsculas: cabe ascendente, descendente e acento. */
    private static final double QUADRO = 1.6;
    private static final double TOPO = 1.25;
    private static final double SEMELHANCA_MESMA_LETRA = 0.88;
    private static final double PESO_LARGURA = 0.6;
    private static final double BONUS_LEGIVEL = 0.15;
    private static final double ESPACO = 0.22;

    private record Modelo(char letra, float[] quadro, double pontos, double largura, double antes, double depois) {
    }

    private static final List<Modelo> MODELOS = carregarModelos();

    /**
     * @param angulo   graus, no sentido da leitura (0 = horizontal da esquerda para a direita, y para baixo)
     * @param confianca média da semelhança das letras com o modelo, de 0 a 1
     */
    record Linha(String texto, int cor, double angulo, double confianca, Rectangle2D caixa, double centroX, double centroY,
                 double alturaLetra) {
    }

    private record Leitura(char letra, double nota, boolean espacoAntes, float[] quadro, double pontos) {
    }

    private record LinhaLida(List<ExtratorVetorialPdf.Glifo> glifos, double angulo, double nota, List<Leitura> letras,
                             double alturaLetra) {
    }

    private ReconhecedorGlifos() {
    }

    /** Altura típica das letras da folha: a mediana do maior lado dos glifos mais complexos (algarismos e maiúsculas). */
    static double alturaTipica(List<ExtratorVetorialPdf.Glifo> glifos) {
        List<Double> lados = glifos.stream().filter(g -> g.vertices() >= 40)
                .map(g -> Math.max(g.caixa().getWidth(), g.caixa().getHeight())).sorted().toList();
        return lados.isEmpty() ? 4 : lados.get(lados.size() / 2);
    }

    static List<Linha> ler(List<ExtratorVetorialPdf.Glifo> glifos) {
        double h = alturaTipica(glifos);
        List<LinhaLida> lidas = agrupar(glifos, h).stream().map(grupo -> lerGrupo(grupo, h)).toList();
        votar(lidas);
        List<Linha> linhas = new ArrayList<>();
        for (LinhaLida lida : lidas) {
            StringBuilder texto = new StringBuilder();
            for (Leitura l : lida.letras()) {
                texto.append(l.espacoAntes() ? " " : "").append(l.letra());
            }
            Rectangle2D caixa = null;
            double cx = 0;
            double cy = 0;
            for (ExtratorVetorialPdf.Glifo g : lida.glifos()) {
                caixa = caixa == null ? (Rectangle2D) g.caixa().clone() : caixa.createUnion(g.caixa());
                cx += g.caixa().getCenterX();
                cy += g.caixa().getCenterY();
            }
            int n = lida.glifos().size();
            linhas.add(new Linha(texto.toString(), lida.glifos().getFirst().cor(), lida.angulo(), lida.nota(), caixa,
                    cx / n, cy / n, lida.alturaLetra()));
        }
        return linhas;
    }

    // ---- agrupamento em linhas ----

    private static List<List<ExtratorVetorialPdf.Glifo>> agrupar(List<ExtratorVetorialPdf.Glifo> glifos, double h) {
        int n = glifos.size();
        int[] pai = new int[n];
        for (int i = 0; i < n; i++) {
            pai[i] = i;
        }
        for (int i = 0; i < n; i++) {
            ExtratorVetorialPdf.Glifo a = glifos.get(i);
            for (int j = i + 1; j < n; j++) {
                ExtratorVetorialPdf.Glifo b = glifos.get(j);
                if (a.cor() != b.cor()) {
                    continue;
                }
                double dc = Math.hypot(a.caixa().getCenterX() - b.caixa().getCenterX(), a.caixa().getCenterY() - b.caixa().getCenterY());
                if (dc < 1.35 * h && distanciaCaixas(a.caixa(), b.caixa()) < 0.6 * h) {
                    unir(pai, i, j);
                }
            }
        }
        Map<Integer, List<ExtratorVetorialPdf.Glifo>> porRaiz = new HashMap<>();
        for (int i = 0; i < n; i++) {
            porRaiz.computeIfAbsent(raiz(pai, i), k -> new ArrayList<>()).add(glifos.get(i));
        }
        List<List<ExtratorVetorialPdf.Glifo>> grupos = new ArrayList<>(porRaiz.values());
        juntarColineares(grupos, h);
        return grupos;
    }

    /** Palavras da mesma linha inclinada que o primeiro passo separou: junta quando seguem na mesma direção. */
    private static void juntarColineares(List<List<ExtratorVetorialPdf.Glifo>> grupos, double h) {
        boolean mudou = true;
        while (mudou) {
            mudou = false;
            externo:
            for (int i = 0; i < grupos.size(); i++) {
                for (int j = i + 1; j < grupos.size(); j++) {
                    List<ExtratorVetorialPdf.Glifo> a = grupos.get(i);
                    List<ExtratorVetorialPdf.Glifo> b = grupos.get(j);
                    if (a.getFirst().cor() != b.getFirst().cor()) {
                        continue;
                    }
                    double[] d = direcao(a.size() >= b.size() ? a : b);
                    if (d == null) {
                        d = direcao(a.size() >= b.size() ? b : a);
                    }
                    if (d == null) {
                        continue;
                    }
                    double melhor = Double.MAX_VALUE;
                    double vx = 0;
                    double vy = 0;
                    for (ExtratorVetorialPdf.Glifo ga : a) {
                        for (ExtratorVetorialPdf.Glifo gb : b) {
                            double dx = gb.caixa().getCenterX() - ga.caixa().getCenterX();
                            double dy = gb.caixa().getCenterY() - ga.caixa().getCenterY();
                            double dist = Math.hypot(dx, dy);
                            if (dist < melhor) {
                                melhor = dist;
                                vx = dx;
                                vy = dy;
                            }
                        }
                    }
                    // Na mesma reta: além de seguir a direção, o desvio lateral fica pequeno (cotas paralelas não se juntam).
                    double lateral = Math.abs(-vx * d[1] + vy * d[0]);
                    if (melhor > 0 && melhor <= 2.2 * h && Math.abs(vx * d[0] + vy * d[1]) / melhor > 0.94 && lateral < 0.35 * h) {
                        a.addAll(b);
                        grupos.remove(j);
                        mudou = true;
                        break externo;
                    }
                }
            }
        }
    }

    /** Direção principal dos centros (eixo de maior variância), ou nula quando o grupo não tem direção clara. */
    private static double[] direcao(List<ExtratorVetorialPdf.Glifo> grupo) {
        if (grupo.size() < 2) {
            return null;
        }
        double mx = 0;
        double my = 0;
        for (ExtratorVetorialPdf.Glifo g : grupo) {
            mx += g.caixa().getCenterX();
            my += g.caixa().getCenterY();
        }
        mx /= grupo.size();
        my /= grupo.size();
        double sxx = 0;
        double syy = 0;
        double sxy = 0;
        for (ExtratorVetorialPdf.Glifo g : grupo) {
            double dx = g.caixa().getCenterX() - mx;
            double dy = g.caixa().getCenterY() - my;
            sxx += dx * dx;
            syy += dy * dy;
            sxy += dx * dy;
        }
        double tr = sxx + syy;
        double det = sxx * syy - sxy * sxy;
        double l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
        double l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
        if (Math.sqrt(l1) <= 1.5 * Math.sqrt(Math.max(l2, 0)) + 1e-6) {
            return null;
        }
        double ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        return new double[]{Math.cos(ang), Math.sin(ang)};
    }

    private static double distanciaCaixas(Rectangle2D a, Rectangle2D b) {
        double dx = Math.max(0, Math.max(a.getMinX(), b.getMinX()) - Math.min(a.getMaxX(), b.getMaxX()));
        double dy = Math.max(0, Math.max(a.getMinY(), b.getMinY()) - Math.min(a.getMaxY(), b.getMaxY()));
        return Math.hypot(dx, dy);
    }

    private static int raiz(int[] pai, int i) {
        while (pai[i] != i) {
            pai[i] = pai[pai[i]];
            i = pai[i];
        }
        return i;
    }

    private static void unir(int[] pai, int a, int b) {
        pai[raiz(pai, a)] = raiz(pai, b);
    }

    // ---- leitura de uma linha ----

    private record LetraGirada(List<double[][]> contornos, double centro, double minX, double maxX, double minY, double maxY) {
    }

    private static LinhaLida lerGrupo(List<ExtratorVetorialPdf.Glifo> grupo, double h) {
        double[] d = grupo.size() >= 2 ? direcaoSemCorte(grupo) : null;
        List<Double> angulos = new ArrayList<>();
        if (d != null) {
            double a = Math.atan2(d[1], d[0]);
            angulos.add(a);
            angulos.add(a + Math.PI);
        } else {
            angulos.addAll(List.of(0.0, Math.PI / 2, -Math.PI / 2, Math.PI));
        }
        LinhaLida melhor = null;
        double melhorComparacao = -Double.MAX_VALUE;
        for (double angulo : angulos) {
            double c = Math.cos(angulo);
            double s = Math.sin(angulo);
            List<LetraGirada> letras = new ArrayList<>();
            for (ExtratorVetorialPdf.Glifo g : grupo) {
                List<double[][]> girados = new ArrayList<>();
                double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE, minY = Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
                for (double[][] contorno : g.contornos()) {
                    double[][] novo = new double[contorno.length][];
                    for (int k = 0; k < contorno.length; k++) {
                        double x = contorno[k][0] * c + contorno[k][1] * s;
                        double y = -contorno[k][0] * s + contorno[k][1] * c;
                        novo[k] = new double[]{x, y};
                        minX = Math.min(minX, x);
                        maxX = Math.max(maxX, x);
                        minY = Math.min(minY, y);
                        maxY = Math.max(maxY, y);
                    }
                    girados.add(novo);
                }
                letras.add(new LetraGirada(girados, (minX + maxX) / 2, minX, maxX, minY, maxY));
            }
            letras.sort(Comparator.comparingDouble(LetraGirada::centro));
            double base = mediana(letras.stream().map(LetraGirada::maxY).toList());
            double hLinha = mediana(letras.stream().map(l -> l.maxY() - l.minY()).toList());
            if (hLinha < 0.8 * h) {
                hLinha = h;
            }
            List<Leitura> leituras = new ArrayList<>();
            double total = 0;
            double fimAnterior = 0;
            double depoisAnterior = 0;
            boolean primeira = true;
            for (int idx = 0; idx < letras.size(); idx++) {
                LetraGirada letra = letras.get(idx);
                // Base local (vizinhas): duas cotas em sequência podem estar um pouco deslocadas uma da outra.
                List<Double> vizinhas = new ArrayList<>();
                for (int k = Math.max(0, idx - 3); k <= Math.min(letras.size() - 1, idx + 3); k++) {
                    vizinhas.add(letras.get(k).maxY());
                }
                double baseLocal = letras.size() > 7 ? mediana(vizinhas) : base;
                float[] quadro = rasterizar(letra.contornos(), letra.centro(), baseLocal, hLinha);
                double largura = (letra.maxX() - letra.minX()) / hLinha;
                Modelo modelo = null;
                double nota = -Double.MAX_VALUE;
                for (Modelo m : MODELOS) {
                    double sc = semelhanca(quadro, m.quadro(), m.pontos()) - PESO_LARGURA * Math.abs(largura - m.largura());
                    if (sc > nota) {
                        nota = sc;
                        modelo = m;
                    }
                }
                boolean espaco = !primeira && (letra.minX() - fimAnterior) / hLinha - (depoisAnterior + modelo.antes()) > ESPACO;
                leituras.add(new Leitura(modelo.letra(), nota, espaco, quadro, soma(quadro)));
                total += nota;
                fimAnterior = letra.maxX();
                depoisAnterior = modelo.depois();
                primeira = false;
            }
            double media = total / letras.size();
            double normalizado = Math.atan2(Math.sin(angulo), Math.cos(angulo));
            boolean legivel = normalizado > -Math.PI * 0.56 && normalizado < Math.PI * 0.56;
            double comparacao = media + (legivel ? BONUS_LEGIVEL : 0);
            if (comparacao > melhorComparacao) {
                melhorComparacao = comparacao;
                melhor = new LinhaLida(grupo, Math.toDegrees(normalizado), media, leituras, hLinha);
            }
        }
        return melhor;
    }

    private static double[] direcaoSemCorte(List<ExtratorVetorialPdf.Glifo> grupo) {
        double[] d = direcao(grupo);
        if (d != null) {
            return d;
        }
        // Duas ou três letras quase sobrepostas: vale a reta entre a primeira e a última.
        ExtratorVetorialPdf.Glifo a = grupo.getFirst();
        ExtratorVetorialPdf.Glifo b = grupo.getLast();
        double dx = b.caixa().getCenterX() - a.caixa().getCenterX();
        double dy = b.caixa().getCenterY() - a.caixa().getCenterY();
        double n = Math.hypot(dx, dy);
        return n == 0 ? null : new double[]{dx / n, dy / n};
    }

    private static double mediana(List<Double> valores) {
        List<Double> ordenados = valores.stream().sorted().toList();
        return ordenados.get(ordenados.size() / 2);
    }

    /**
     * Quadro R×R com a cobertura de cada pixel (0 a 1, com suavização): largura 1,4h centrada na letra; altura de 1,25h
     * acima da linha de base a 0,35h abaixo. A cobertura mantém a forma de letras miúdas que um quadro preto e branco afina.
     */
    static float[] rasterizar(List<double[][]> contornos, double centroX, double base, double h) {
        double topo = base - TOPO * h;
        double escala = R / (QUADRO * h);
        double esquerda = centroX - 0.7 * h;
        Path2D.Double forma = new Path2D.Double(Path2D.WIND_EVEN_ODD);
        for (double[][] contorno : contornos) {
            forma.moveTo((contorno[0][0] - esquerda) * escala, (contorno[0][1] - topo) * escala);
            for (int k = 1; k < contorno.length; k++) {
                forma.lineTo((contorno[k][0] - esquerda) * escala, (contorno[k][1] - topo) * escala);
            }
            forma.closePath();
        }
        BufferedImage imagem = new BufferedImage(R, R, BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g = imagem.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        g.setColor(java.awt.Color.WHITE);
        g.fill(forma);
        g.dispose();
        float[] cobertura = new float[R * R];
        var raster = imagem.getRaster();
        for (int y = 0; y < R; y++) {
            for (int x = 0; x < R; x++) {
                cobertura[y * R + x] = raster.getSample(x, y, 0) / 255f;
            }
        }
        return cobertura;
    }

    private static double soma(float[] a) {
        double s = 0;
        for (float v : a) {
            s += v;
        }
        return s;
    }

    /** Interseção sobre união com cobertura parcial: soma dos mínimos sobre soma dos máximos. */
    private static double semelhanca(float[] a, float[] b, double somaB) {
        double minimos = 0;
        double maximos = 0;
        for (int i = 0; i < a.length; i++) {
            float x = a[i];
            float y = b[i];
            if (x < y) {
                minimos += x;
                maximos += y;
            } else {
                minimos += y;
                maximos += x;
            }
        }
        return maximos == 0 ? 0 : minimos / maximos;
    }

    // ---- votação na folha ----

    private static void votar(List<LinhaLida> linhas) {
        List<Leitura> todas = new ArrayList<>();
        List<int[]> posicoes = new ArrayList<>();
        for (int li = 0; li < linhas.size(); li++) {
            for (int ci = 0; ci < linhas.get(li).letras().size(); ci++) {
                todas.add(linhas.get(li).letras().get(ci));
                posicoes.add(new int[]{li, ci});
            }
        }
        int n = todas.size();
        int[] grupo = new int[n];
        java.util.Arrays.fill(grupo, -1);
        int g = 0;
        for (int i = 0; i < n; i++) {
            if (grupo[i] >= 0) {
                continue;
            }
            for (int j = i; j < n; j++) {
                if (grupo[j] < 0 && semelhanca(todas.get(i).quadro(), todas.get(j).quadro(), todas.get(j).pontos()) > SEMELHANCA_MESMA_LETRA) {
                    grupo[j] = g;
                }
            }
            g++;
        }
        Map<Integer, Map<Character, Double>> votos = new HashMap<>();
        for (int i = 0; i < n; i++) {
            votos.computeIfAbsent(grupo[i], k -> new HashMap<>()).merge(todas.get(i).letra(), Math.max(0, todas.get(i).nota()), Double::sum);
        }
        for (int i = 0; i < n; i++) {
            Map<Character, Double> v = votos.get(grupo[i]);
            char vencedora = v.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse(todas.get(i).letra());
            Leitura l = todas.get(i);
            int[] p = posicoes.get(i);
            linhas.get(p[0]).letras().set(p[1], new Leitura(vencedora, l.nota(), l.espacoAntes(), l.quadro(), l.pontos()));
        }
    }

    // ---- modelos ----

    private static List<Modelo> carregarModelos() {
        try (InputStream entrada = ReconhecedorGlifos.class.getResourceAsStream("/projeto/glifos-modelo.json")) {
            if (entrada == null) {
                throw new IllegalStateException("Modelos de letra não encontrados.");
            }
            JsonNode raiz = new ObjectMapper().readTree(entrada);
            List<Modelo> modelos = new ArrayList<>();
            for (JsonNode no : raiz.path("glifos")) {
                List<double[][]> contornos = new ArrayList<>();
                double minX = Double.MAX_VALUE;
                double maxX = -Double.MAX_VALUE;
                for (JsonNode c : no.path("contornos")) {
                    double[][] pontos = new double[c.size() / 2][];
                    for (int k = 0; k < pontos.length; k++) {
                        pontos[k] = new double[]{c.get(2 * k).asDouble(), c.get(2 * k + 1).asDouble()};
                        minX = Math.min(minX, pontos[k][0]);
                        maxX = Math.max(maxX, pontos[k][0]);
                    }
                    if (pontos.length >= 3) {
                        contornos.add(pontos);
                    }
                }
                double centro = contornos.isEmpty() ? 0 : (minX + maxX) / 2;
                float[] quadro = rasterizar(contornos, centro, 0, 1);
                double largura = contornos.isEmpty() ? 0 : maxX - minX;
                modelos.add(new Modelo(no.path("c").asText().charAt(0), quadro, soma(quadro), largura,
                        no.path("lsb").asDouble(), no.path("rsb").asDouble()));
            }
            return List.copyOf(modelos);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
