package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.usecases.GeometriaDxf.Forma;
import com.nexo.app.modules.obras.application.usecases.GeometriaDxf.TextoDesenho;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.util.Matrix;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Gera a planta em PDF a partir do DXF, para a obra que só tem o arquivo CAD. A planta vira o projeto mestre: a tela de
 * planejamento e o app de campo continuam trabalhando com um PDF, como sempre. A folha é centrada na obra, em escala
 * padrão, e leva no próprio PDF a relação exata entre a coordenada UTM e a posição na folha, que a leitura usa sem
 * precisar ajustar nada.
 */
@Component
public class GeradorPlantaCad {

    /** Chave do metadado com a georreferência da planta: versão|a|b|c|d|leste0|norte0 (ver {@link LeitorVetorialProjeto.Semelhanca}). */
    static final String METADADO_GEORREFERENCIA = "GeoReferenciaUtm";
    private static final double METROS_POR_PONTO_EM_1 = 0.0254 / 72;
    private static final int[] ESCALAS = {200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000};
    /** A3 até 1:5.000; acima disso a obra é grande e vai em A1. */
    private static final int MAIOR_ESCALA_A3 = 5000;
    private static final float MARGEM = 20;
    private static final float CARIMBO = 46;
    private static final float TRACO = 0.35f;
    private static final float TRACO_NOVO = 0.9f;
    private static final double MENOR_TEXTO_PT = 0.6;
    /** Lado máximo, em metros, da caixinha de marcação de texto projetado. */
    private static final double MAIOR_MARCACAO_M = 4;

    /**
     * @param janela área do desenho a mostrar, em UTM: leste mínimo, norte mínimo, leste máximo, norte máximo
     */
    public record Planta(byte[] pdf, int escala, String folha) {
    }

    /**
     * @param titulo texto do carimbo (ex.: número e título da obra); nada de marca de empresa
     */
    public Planta gerar(GeometriaDxf.Desenho desenho, double[] janela, String nomeArquivo, String titulo) {
        double larguraM = Math.max(janela[2] - janela[0], 1);
        double alturaM = Math.max(janela[3] - janela[1], 1);
        PDRectangle papel = null;
        int escala = 0;
        String folha = null;
        for (int e : ESCALAS) {
            PDRectangle candidato = e <= MAIOR_ESCALA_A3 ? deitada(PDRectangle.A3) : deitada(PDRectangle.A1);
            double mpp = METROS_POR_PONTO_EM_1 * e;
            if (larguraM / mpp <= candidato.getWidth() - 2 * MARGEM && alturaM / mpp <= candidato.getHeight() - 2 * MARGEM - CARIMBO) {
                papel = candidato;
                escala = e;
                folha = e <= MAIOR_ESCALA_A3 ? "A3" : "A1";
                break;
            }
        }
        if (papel == null) {
            // Maior que 1:100.000 em A1: cabe do jeito que der, sem escala redonda.
            papel = deitada(PDRectangle.A1);
            folha = "A1";
            double mpp = Math.max(larguraM / (papel.getWidth() - 2 * MARGEM), alturaM / (papel.getHeight() - 2 * MARGEM - CARIMBO));
            escala = (int) Math.ceil(mpp / METROS_POR_PONTO_EM_1);
        }
        double mpp = METROS_POR_PONTO_EM_1 * escala;
        float areaX0 = MARGEM;
        float areaY0 = MARGEM + CARIMBO;
        float areaX1 = papel.getWidth() - MARGEM;
        float areaY1 = papel.getHeight() - MARGEM;
        double centroLeste = (janela[0] + janela[2]) / 2;
        double centroNorte = (janela[1] + janela[3]) / 2;
        double centroX = (areaX0 + areaX1) / 2.0;
        double centroY = (areaY0 + areaY1) / 2.0;
        Conversao conv = new Conversao(centroLeste, centroNorte, centroX, centroY, mpp);

        try (PDDocument documento = new PDDocument(); ByteArrayOutputStream saida = new ByteArrayOutputStream()) {
            PDPage pagina = new PDPage(papel);
            documento.addPage(pagina);
            PDType1Font fonte = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            PDType1Font negrito = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
            try (PDPageContentStream c = new PDPageContentStream(documento, pagina)) {
                c.saveGraphicsState();
                c.addRect(areaX0, areaY0, areaX1 - areaX0, areaY1 - areaY0);
                c.clip();
                desenharFormas(c, desenho.formas(), conv, areaX0, areaY0, areaX1, areaY1);
                desenharTextos(c, desenho.textos(), conv, fonte, areaX0, areaY0, areaX1, areaY1);
                c.restoreGraphicsState();
                carimbo(c, papel, fonte, negrito, nomeArquivo, titulo, escala, folha);
                norte(c, areaX1 - 24, areaY1 - 40, negrito);
            }
            // Posição na folha como ela aparece (y para baixo): é a convenção do planejamento.
            double alturaPagina = papel.getHeight();
            PDDocumentInformation info = documento.getDocumentInformation();
            info.setTitle(titulo != null ? titulo : "Planta do projeto");
            info.setSubject("Planta gerada do arquivo CAD " + nomeArquivo);
            info.setCustomMetadataValue(METADADO_GEORREFERENCIA, String.join("|", "1",
                    String.valueOf(1 / mpp), "0", String.valueOf(centroX), String.valueOf(alturaPagina - centroY),
                    String.valueOf(centroLeste), String.valueOf(centroNorte)));
            documento.save(saida);
            return new Planta(saida.toByteArray(), escala, folha);
        } catch (IOException e) {
            throw new InvarianteVioladaException("Não foi possível gerar a planta a partir do arquivo CAD.");
        }
    }

    /** Georreferência gravada numa planta gerada por aqui; vazia em qualquer outro PDF. */
    public static Optional<LeitorVetorialProjeto.Georreferencia> georreferenciaGravada(byte[] pdf, int pagina) {
        try (PDDocument documento = Loader.loadPDF(pdf)) {
            String valor = documento.getDocumentInformation().getCustomMetadataValue(METADADO_GEORREFERENCIA);
            if (valor == null || pagina != 1 || documento.getNumberOfPages() < 1) {
                return Optional.empty();
            }
            String[] p = valor.split("\\|");
            if (p.length != 7 || !"1".equals(p[0])) {
                return Optional.empty();
            }
            PDRectangle caixa = documento.getPage(0).getMediaBox();
            LeitorVetorialProjeto.Semelhanca s = new LeitorVetorialProjeto.Semelhanca(Double.parseDouble(p[1]),
                    Double.parseDouble(p[2]), Double.parseDouble(p[3]), Double.parseDouble(p[4]),
                    Double.parseDouble(p[5]), Double.parseDouble(p[6]));
            return Optional.of(new LeitorVetorialProjeto.Georreferencia(s, caixa.getWidth(), caixa.getHeight()));
        } catch (IOException | RuntimeException e) {
            return Optional.empty();
        }
    }

    /** UTM → ponto de PDF (origem embaixo, y para cima). */
    private record Conversao(double leste0, double norte0, double x0, double y0, double mpp) {
        float x(double leste) {
            return (float) (x0 + (leste - leste0) / mpp);
        }

        float y(double norte) {
            return (float) (y0 + (norte - norte0) / mpp);
        }
    }

    private static PDRectangle deitada(PDRectangle r) {
        return new PDRectangle(r.getHeight(), r.getWidth());
    }

    private static void desenharFormas(PDPageContentStream c, List<Forma> formas, Conversao conv,
                                       float x0, float y0, float x1, float y1) throws IOException {
        int corAtual = -1;
        float tracoAtual = -1;
        for (Forma f : formas) {
            if (marcacaoDeTexto(f)) {
                continue;
            }
            float minX = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, minY = Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
            float[] xs = new float[f.pontos().size()];
            float[] ys = new float[f.pontos().size()];
            for (int i = 0; i < xs.length; i++) {
                xs[i] = conv.x(f.pontos().get(i)[0]);
                ys[i] = conv.y(f.pontos().get(i)[1]);
                minX = Math.min(minX, xs[i]);
                maxX = Math.max(maxX, xs[i]);
                minY = Math.min(minY, ys[i]);
                maxY = Math.max(maxY, ys[i]);
            }
            if (maxX < x0 || minX > x1 || maxY < y0 || minY > y1) {
                continue;
            }
            if (f.cor() != corAtual) {
                Color cor = new Color(f.cor());
                c.setStrokingColor(cor);
                c.setNonStrokingColor(cor);
                corAtual = f.cor();
            }
            // Rede nova em traço grosso; marcações das camadas de texto ficam finas.
            String camada = f.camada().toUpperCase(Locale.ROOT);
            float traco = camada.endsWith("_PROJ") && !camada.startsWith("TEXTO") ? TRACO_NOVO : TRACO;
            if (traco != tracoAtual) {
                c.setLineWidth(traco);
                tracoAtual = traco;
            }
            c.moveTo(xs[0], ys[0]);
            for (int i = 1; i < xs.length; i++) {
                c.lineTo(xs[i], ys[i]);
            }
            if (f.preenchida()) {
                c.closePath();
                c.fill();
            } else {
                c.stroke();
            }
        }
    }

    /**
     * Caixinhas que o programa de projeto põe junto dos textos de elemento projetado: servem à tela dele, não saem no
     * plot (o PDF do próprio projetista não as mostra), então também ficam fora da planta.
     */
    static boolean marcacaoDeTexto(Forma f) {
        String camada = f.camada().toUpperCase(Locale.ROOT);
        if (!camada.startsWith("TEXTO") || !camada.endsWith("_PROJ")) {
            return false;
        }
        double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE, minY = Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
        for (double[] p : f.pontos()) {
            minX = Math.min(minX, p[0]);
            maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]);
            maxY = Math.max(maxY, p[1]);
        }
        return Math.max(maxX - minX, maxY - minY) < MAIOR_MARCACAO_M;
    }

    private static void desenharTextos(PDPageContentStream c, List<TextoDesenho> textos, Conversao conv, PDType1Font fonte,
                                       float x0, float y0, float x1, float y1) throws IOException {
        Map<Character, Boolean> codificavel = new HashMap<>();
        for (TextoDesenho t : textos) {
            float x = conv.x(t.x());
            float y = conv.y(t.y());
            double tamanho = t.altura() / conv.mpp();
            if (tamanho < MENOR_TEXTO_PT || x < x0 - 200 || x > x1 + 200 || y < y0 - 200 || y > y1 + 200) {
                continue;
            }
            String texto = codificar(t.texto(), fonte, codificavel);
            if (texto.isBlank()) {
                continue;
            }
            double largura = fonte.getStringWidth(texto) / 1000 * tamanho;
            // Altura das maiúsculas da Helvetica: ~0,72 do corpo; é ela que a âncora vertical do CAD usa.
            double alturaLetra = 0.72 * tamanho;
            double rad = Math.toRadians(t.rotacao());
            double cos = Math.cos(rad);
            double sin = Math.sin(rad);
            double dx = -t.ancoraHorizontal() * largura;
            double dy = -t.ancoraVertical() * alturaLetra;
            float bx = (float) (x + dx * cos - dy * sin);
            float by = (float) (y + dx * sin + dy * cos);
            c.setNonStrokingColor(new Color(t.cor()));
            c.beginText();
            c.setFont(fonte, (float) tamanho);
            c.setTextMatrix(new Matrix((float) cos, (float) sin, (float) -sin, (float) cos, bx, by));
            c.showText(texto);
            c.endText();
        }
    }

    /** A Helvetica embutida no leitor de PDF só tem o alfabeto ocidental: o resto vira "?". */
    private static String codificar(String texto, PDType1Font fonte, Map<Character, Boolean> cache) {
        StringBuilder s = new StringBuilder(texto.length());
        for (char ch : texto.toCharArray()) {
            boolean ok = cache.computeIfAbsent(ch, k -> {
                try {
                    fonte.encode(String.valueOf(k));
                    return true;
                } catch (IOException | IllegalArgumentException e) {
                    return false;
                }
            });
            s.append(ok ? ch : '?');
        }
        return s.toString();
    }

    private static void carimbo(PDPageContentStream c, PDRectangle papel, PDType1Font fonte, PDType1Font negrito,
                                String nomeArquivo, String titulo, int escala, String folha) throws IOException {
        float x0 = MARGEM;
        float x1 = papel.getWidth() - MARGEM;
        c.setStrokingColor(Color.BLACK);
        c.setNonStrokingColor(Color.BLACK);
        c.setLineWidth(0.8f);
        c.addRect(x0, MARGEM, x1 - x0, papel.getHeight() - 2 * MARGEM);
        c.stroke();
        c.moveTo(x0, MARGEM + CARIMBO);
        c.lineTo(x1, MARGEM + CARIMBO);
        c.stroke();
        Map<Character, Boolean> cache = new HashMap<>();
        escrever(c, negrito, 11, x0 + 10, MARGEM + CARIMBO - 18, codificar(titulo != null ? titulo : "Planta do projeto", negrito, cache));
        escrever(c, fonte, 8, x0 + 10, MARGEM + CARIMBO - 32, codificar("Planta gerada do arquivo CAD " + nomeArquivo
                + " para o planejamento. Confira com o projeto aprovado.", fonte, cache));
        String direita = String.format(Locale.ROOT, "Escala 1:%,d  |  Folha %s  |  Gerada em %s", escala, folha,
                LocalDate.now(ZoneId.of("America/Sao_Paulo")).format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))).replace(',', '.');
        float largura = fonte.getStringWidth(direita) / 1000 * 8;
        escrever(c, fonte, 8, x1 - 10 - largura, MARGEM + CARIMBO - 32, direita);
    }

    private static void escrever(PDPageContentStream c, PDType1Font fonte, float tamanho, float x, float y, String texto) throws IOException {
        c.beginText();
        c.setFont(fonte, tamanho);
        c.newLineAtOffset(x, y);
        c.showText(texto);
        c.endText();
    }

    /** Seta do norte: o desenho é plotado com o norte da UTM para cima. */
    private static void norte(PDPageContentStream c, float x, float y, PDType1Font negrito) throws IOException {
        c.setNonStrokingColor(Color.BLACK);
        c.moveTo(x, y + 22);
        c.lineTo(x - 6, y + 4);
        c.lineTo(x + 6, y + 4);
        c.closePath();
        c.fill();
        escrever(c, negrito, 9, x - 3.2f, y - 8, "N");
    }
}
