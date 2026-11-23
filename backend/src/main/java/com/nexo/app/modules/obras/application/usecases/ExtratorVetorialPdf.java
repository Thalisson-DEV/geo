package com.nexo.app.modules.obras.application.usecases;

import org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDVectorFont;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.util.Matrix;
import org.apache.pdfbox.util.Vector;

import java.awt.geom.AffineTransform;
import java.awt.geom.GeneralPath;
import java.awt.geom.PathIterator;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Lê o desenho vetorial de uma página: as letras que o programa de projeto desenhou como polígonos, os traços da rede e
 * os símbolos de fonte de simbologia. Tudo sai em pontos de PDF na página como ela aparece (rotação aplicada, origem no
 * canto superior esquerdo).
 */
final class ExtratorVetorialPdf extends PDFGraphicsStreamEngine {

    /** Letra desenhada não passa disso; acima é símbolo, área ou moldura. */
    private static final double MAIOR_LADO_GLIFO_PT = 9;

    /** @param cor RGB 0xRRGGBB */
    record Glifo(List<double[][]> contornos, int cor, Rectangle2D caixa, int vertices) {
    }

    record Segmento(double ax, double ay, double bx, double by, int cor, double largura, boolean tracejado) {
        double comprimento() {
            return Math.hypot(bx - ax, by - ay);
        }
    }

    /** @param caixa contorno real do desenho do símbolo, não a caixa da fonte */
    record Simbolo(String caractere, String fonte, int cor, Rectangle2D caixa) {
        double x() {
            return caixa.getCenterX();
        }

        double y() {
            return caixa.getCenterY();
        }
    }

    record Desenho(List<Glifo> glifos, List<Segmento> segmentos, List<Simbolo> simbolos, double largura, double altura) {
    }

    private final AffineTransform paraTela;
    private final double largura;
    private final double altura;
    private final List<Glifo> glifos = new ArrayList<>();
    private final List<Segmento> segmentos = new ArrayList<>();
    private final List<Simbolo> simbolos = new ArrayList<>();
    private GeneralPath caminho = new GeneralPath();

    private ExtratorVetorialPdf(PDPage page) {
        super(page);
        PDRectangle caixa = page.getCropBox();
        int rotacao = ((page.getRotation() % 360) + 360) % 360;
        boolean deitada = rotacao == 90 || rotacao == 270;
        this.largura = deitada ? caixa.getHeight() : caixa.getWidth();
        this.altura = deitada ? caixa.getWidth() : caixa.getHeight();
        // Página → tela: tira a origem da cropbox, inverte o y e aplica a rotação salva no PDF.
        AffineTransform t = new AffineTransform();
        switch (rotacao) {
            case 90 -> t.setTransform(0, 1, 1, 0, 0, 0);
            case 180 -> t.setTransform(-1, 0, 0, 1, caixa.getWidth(), 0);
            case 270 -> t.setTransform(0, -1, -1, 0, caixa.getHeight(), caixa.getWidth());
            default -> t.setTransform(1, 0, 0, -1, 0, caixa.getHeight());
        }
        t.translate(-caixa.getLowerLeftX(), -caixa.getLowerLeftY());
        this.paraTela = t;
    }

    static Desenho extrair(PDPage page) throws IOException {
        ExtratorVetorialPdf extrator = new ExtratorVetorialPdf(page);
        extrator.processPage(page);
        return new Desenho(List.copyOf(extrator.glifos), List.copyOf(extrator.segmentos), List.copyOf(extrator.simbolos),
                extrator.largura, extrator.altura);
    }

    @Override
    protected void showFontGlyph(Matrix matriz, PDFont font, int codigo, Vector deslocamento) throws IOException {
        String nome = font.getName() != null ? font.getName() : "";
        if (!fonteDeSimbolo(nome) || !(font instanceof PDVectorFont vetorial)) {
            return;
        }
        GeneralPath contorno = vetorial.getNormalizedPath(codigo);
        if (contorno == null || contorno.getBounds2D().isEmpty()) {
            return;
        }
        AffineTransform t = new AffineTransform(paraTela);
        t.concatenate(matriz.createAffineTransform());
        t.scale(1 / 1000.0, 1 / 1000.0);
        Rectangle2D caixa = t.createTransformedShape(contorno).getBounds2D();
        String unicode = font.toUnicode(codigo);
        simbolos.add(new Simbolo(unicode != null ? unicode : String.valueOf((char) codigo), nome, cor(getGraphicsState().getNonStrokingColor()), caixa));
    }

    /** Fonte que desenha símbolos de rede (poste, chave, para-raio) em vez de letras. */
    static boolean fonteDeSimbolo(String nome) {
        String n = nome.toLowerCase(Locale.ROOT);
        return n.contains("simbolog") || n.contains("symbol") || n.contains("georede");
    }

    @Override
    public void appendRectangle(Point2D p0, Point2D p1, Point2D p2, Point2D p3) {
        caminho.moveTo(p0.getX(), p0.getY());
        caminho.lineTo(p1.getX(), p1.getY());
        caminho.lineTo(p2.getX(), p2.getY());
        caminho.lineTo(p3.getX(), p3.getY());
        caminho.closePath();
    }

    @Override
    public void moveTo(float x, float y) {
        caminho.moveTo(x, y);
    }

    @Override
    public void lineTo(float x, float y) {
        caminho.lineTo(x, y);
    }

    @Override
    public void curveTo(float x1, float y1, float x2, float y2, float x3, float y3) {
        caminho.curveTo(x1, y1, x2, y2, x3, y3);
    }

    @Override
    public Point2D getCurrentPoint() {
        return caminho.getCurrentPoint() != null ? caminho.getCurrentPoint() : new Point2D.Float();
    }

    @Override
    public void closePath() {
        caminho.closePath();
    }

    @Override
    public void endPath() {
        caminho = new GeneralPath();
    }

    @Override
    public void strokePath() {
        registrarTraco();
        caminho = new GeneralPath();
    }

    @Override
    public void fillPath(int regra) {
        registrarPreenchimento();
        caminho = new GeneralPath();
    }

    @Override
    public void fillAndStrokePath(int regra) {
        registrarPreenchimento();
        registrarTraco();
        caminho = new GeneralPath();
    }

    @Override
    public void drawImage(PDImage imagem) {
        // Logotipo do carimbo e afins não interessam.
    }

    @Override
    public void clip(int regra) {
    }

    @Override
    public void shadingFill(COSName nome) {
    }

    private void registrarPreenchimento() {
        GeneralPath naTela = (GeneralPath) caminho.createTransformedShape(paraTela);
        Rectangle2D caixa = naTela.getBounds2D();
        if (caixa.getWidth() > MAIOR_LADO_GLIFO_PT || caixa.getHeight() > MAIOR_LADO_GLIFO_PT) {
            return;
        }
        List<double[][]> contornos = new ArrayList<>();
        List<double[]> atual = new ArrayList<>();
        int vertices = 0;
        boolean soRetas = true;
        double[] c = new double[6];
        for (PathIterator it = naTela.getPathIterator(null); !it.isDone(); it.next()) {
            switch (it.currentSegment(c)) {
                case PathIterator.SEG_MOVETO -> {
                    fecharContorno(contornos, atual);
                    atual.add(new double[]{c[0], c[1]});
                }
                case PathIterator.SEG_LINETO -> {
                    atual.add(new double[]{c[0], c[1]});
                    vertices++;
                }
                case PathIterator.SEG_CLOSE -> fecharContorno(contornos, atual);
                default -> soRetas = false;
            }
        }
        fecharContorno(contornos, atual);
        // As letras chegam achatadas em segmentos de reta; curva aqui é símbolo desenhado, não texto.
        if (soRetas && vertices >= 3 && !contornos.isEmpty()) {
            glifos.add(new Glifo(contornos, cor(getGraphicsState().getNonStrokingColor()), caixa, vertices));
        }
    }

    private static void fecharContorno(List<double[][]> contornos, List<double[]> atual) {
        if (atual.size() >= 3) {
            contornos.add(atual.toArray(double[][]::new));
        }
        atual.clear();
    }

    private void registrarTraco() {
        int cor = cor(getGraphicsState().getStrokingColor());
        double escala = Math.sqrt(Math.abs(getGraphicsState().getCurrentTransformationMatrix().createAffineTransform().getDeterminant()));
        double larguraLinha = getGraphicsState().getLineWidth() * escala;
        boolean tracejado = getGraphicsState().getLineDashPattern() != null
                && getGraphicsState().getLineDashPattern().getDashArray().length > 0;
        double[] c = new double[6];
        double[] anterior = null;
        double[] inicio = null;
        for (PathIterator it = caminho.createTransformedShape(paraTela).getPathIterator(null); !it.isDone(); it.next()) {
            int tipo = it.currentSegment(c);
            switch (tipo) {
                case PathIterator.SEG_MOVETO -> {
                    anterior = new double[]{c[0], c[1]};
                    inicio = anterior;
                }
                case PathIterator.SEG_LINETO -> {
                    if (anterior != null) {
                        segmentos.add(new Segmento(anterior[0], anterior[1], c[0], c[1], cor, larguraLinha, tracejado));
                    }
                    anterior = new double[]{c[0], c[1]};
                }
                case PathIterator.SEG_CLOSE -> {
                    if (anterior != null && inicio != null) {
                        segmentos.add(new Segmento(anterior[0], anterior[1], inicio[0], inicio[1], cor, larguraLinha, tracejado));
                    }
                    anterior = inicio;
                }
                default -> {
                    // Curva: liga só as pontas, basta para saber onde o traço começa e termina.
                    int fim = tipo == PathIterator.SEG_CUBICTO ? 4 : 2;
                    if (anterior != null) {
                        segmentos.add(new Segmento(anterior[0], anterior[1], c[fim], c[fim + 1], cor, larguraLinha, tracejado));
                    }
                    anterior = new double[]{c[fim], c[fim + 1]};
                }
            }
        }
    }

    private static int cor(PDColor cor) {
        try {
            return cor.toRGB() & 0xFFFFFF;
        } catch (IOException | UnsupportedOperationException e) {
            return 0;
        }
    }
}
