package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * Transforma uma página do projeto em imagens para o modelo. Folhas grandes viram blocos sobrepostos, para que
 * balões e cotas continuem legíveis, com a posição de cada bloco em [0,1] da folha já girada.
 *
 * <p>A resolução segue o tamanho da folha: projeto plotado em A4 tem balões de poucos milímetros e precisa de mais
 * pontos por polegada que uma prancha A1. Desenho deitado é girado antes, para o texto chegar de pé ao modelo.</p>
 */
@Component
public class RenderizadorPaginaProjeto {

    private static final float DPI_MAXIMO = 450f;
    private static final int MAIOR_LADO_PAGINA = 5000;
    private static final int MAIOR_LADO_BLOCO = 1600;
    private static final int MAIOR_LADO_FOLHA_INTEIRA = 2400;
    private static final int MAIOR_LADO_VISAO_GERAL = 1600;
    private static final int MAXIMO_POR_EIXO = 4;
    private static final double SOBREPOSICAO = 0.12;
    /** Abaixo disso o bloco é só papel em branco e não vale uma consulta. */
    private static final double TINTA_MINIMA = 0.002;

    /**
     * @param rotacao graus, no sentido horário, que a folha foi girada antes do recorte; as posições do bloco estão
     *                na folha girada
     */
    public record Bloco(double inicioX, double inicioY, double largura, double altura, String base64Jpeg, int rotacao) {

        public Bloco(double inicioX, double inicioY, double largura, double altura, String base64Jpeg) {
            this(inicioX, inicioY, largura, altura, base64Jpeg, 0);
        }
    }

    /** Ponto já encontrado, desenhado na folha para o modelo seguir as ligações entre eles. */
    public record Marcador(String rotulo, double x, double y) {
    }

    public List<Bloco> renderizar(byte[] pdf, int pagina) {
        return renderizar(pdf, pagina, 0);
    }

    public List<Bloco> renderizar(byte[] pdf, int pagina, int rotacao) {
        BufferedImage imagem = girar(renderizarPagina(pdf, pagina, MAIOR_LADO_PAGINA, DPI_MAXIMO), rotacao);
        try {
            return dividir(imagem, rotacao);
        } catch (IOException e) {
            throw new InvarianteVioladaException("Não foi possível ler o PDF do projeto.");
        }
    }

    /** A folha inteira numa imagem só, para ver as ligações da rede de uma ponta à outra. */
    public Bloco renderizarInteira(byte[] pdf, int pagina) {
        return renderizarInteira(pdf, pagina, 0);
    }

    public Bloco renderizarInteira(byte[] pdf, int pagina, int rotacao) {
        return inteira(girar(renderizarPagina(pdf, pagina, MAIOR_LADO_FOLHA_INTEIRA, DPI_MAXIMO), rotacao), rotacao);
    }

    /**
     * A folha nas quatro rotações (0°, 90°, 180° e 270°, nessa ordem), cada uma com a letra A, B, C ou D no canto: o
     * modelo acerta mais escolhendo a imagem com o texto de pé do que dizendo para que lado girar.
     */
    public List<Bloco> renderizarOrientacoes(byte[] pdf, int pagina) {
        BufferedImage folha = renderizarPagina(pdf, pagina, MAIOR_LADO_VISAO_GERAL, DPI_MAXIMO);
        List<Bloco> opcoes = new ArrayList<>();
        String[] letras = {"A", "B", "C", "D"};
        for (int i = 0; i < 4; i++) {
            BufferedImage girada = girar(folha, i * 90);
            BufferedImage copia = new BufferedImage(girada.getWidth(), girada.getHeight(), BufferedImage.TYPE_INT_RGB);
            Graphics2D g = copia.createGraphics();
            try {
                g.drawImage(girada, 0, 0, null);
                int tamanho = Math.max(40, Math.max(copia.getWidth(), copia.getHeight()) / 14);
                g.setColor(Color.RED);
                g.fillRect(0, 0, tamanho + tamanho / 2, tamanho + tamanho / 3);
                g.setColor(Color.WHITE);
                g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, tamanho));
                g.drawString(letras[i], tamanho / 5, tamanho);
            } finally {
                g.dispose();
            }
            opcoes.add(inteira(copia, i * 90));
        }
        return opcoes;
    }

    /**
     * Folha inteira com os pontos já encontrados destacados por número, para o modelo só precisar seguir as linhas.
     *
     * @param marcadores posições na página como ela está no PDF, antes de girar
     */
    public Bloco renderizarComMarcadores(byte[] pdf, int pagina, int rotacao, List<Marcador> marcadores) {
        BufferedImage imagem = girar(renderizarPagina(pdf, pagina, MAIOR_LADO_FOLHA_INTEIRA, DPI_MAXIMO), rotacao);
        Graphics2D g = imagem.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            int raio = Math.max(10, Math.max(imagem.getWidth(), imagem.getHeight()) / 160);
            g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, raio + 4));
            g.setStroke(new BasicStroke(Math.max(2f, raio / 4f)));
            for (Marcador marcador : marcadores) {
                double[] naFolha = paraFolhaGirada(marcador.x(), marcador.y(), rotacao);
                int cx = (int) Math.round(naFolha[0] * imagem.getWidth());
                int cy = (int) Math.round(naFolha[1] * imagem.getHeight());
                g.setColor(Color.RED);
                g.drawOval(cx - raio, cy - raio, raio * 2, raio * 2);
                g.drawString(marcador.rotulo(), cx + raio + 2, cy - raio);
            }
        } finally {
            g.dispose();
        }
        return inteira(imagem, rotacao);
    }

    /** Posição na página do PDF → posição na folha girada no sentido horário (a mesma conta da tela). */
    static double[] paraFolhaGirada(double x, double y, int rotacao) {
        return switch (normalizar(rotacao)) {
            case 90 -> new double[]{1 - y, x};
            case 180 -> new double[]{1 - x, 1 - y};
            case 270 -> new double[]{y, 1 - x};
            default -> new double[]{x, y};
        };
    }

    /** Posição na folha girada → posição na página do PDF. */
    static double[] paraPagina(double x, double y, int rotacao) {
        return switch (normalizar(rotacao)) {
            case 90 -> new double[]{y, 1 - x};
            case 180 -> new double[]{1 - x, 1 - y};
            case 270 -> new double[]{1 - y, x};
            default -> new double[]{x, y};
        };
    }

    static int normalizar(int rotacao) {
        int graus = ((rotacao % 360) + 360) % 360;
        return graus - graus % 90;
    }

    private static BufferedImage renderizarPagina(byte[] pdf, int pagina, int maiorLado, float dpiMaximo) {
        try (PDDocument documento = Loader.loadPDF(pdf)) {
            if (pagina < 1 || pagina > documento.getNumberOfPages()) {
                throw new InvarianteVioladaException("O projeto não tem a página " + pagina + ".");
            }
            var caixa = documento.getPage(pagina - 1).getBBox();
            float maiorLadoEmPontos = Math.max(caixa.getWidth(), caixa.getHeight());
            float dpi = Math.min(dpiMaximo, maiorLado * 72f / maiorLadoEmPontos);
            return new PDFRenderer(documento).renderImageWithDPI(pagina - 1, dpi, ImageType.RGB);
        } catch (IOException e) {
            throw new InvarianteVioladaException("Não foi possível ler o PDF do projeto.");
        }
    }

    private static BufferedImage girar(BufferedImage origem, int rotacao) {
        int graus = normalizar(rotacao);
        if (graus == 0) {
            return origem;
        }
        int w = origem.getWidth();
        int h = origem.getHeight();
        boolean deitada = graus == 90 || graus == 270;
        BufferedImage destino = new BufferedImage(deitada ? h : w, deitada ? w : h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = destino.createGraphics();
        try {
            g.translate(destino.getWidth() / 2d, destino.getHeight() / 2d);
            g.rotate(Math.toRadians(graus));
            g.translate(-w / 2d, -h / 2d);
            g.drawImage(origem, 0, 0, null);
        } finally {
            g.dispose();
        }
        return destino;
    }

    private static Bloco inteira(BufferedImage imagem, int rotacao) {
        try {
            return new Bloco(0, 0, 1, 1, paraJpeg(imagem), normalizar(rotacao));
        } catch (IOException e) {
            throw new InvarianteVioladaException("Não foi possível ler o PDF do projeto.");
        }
    }

    private static List<Bloco> dividir(BufferedImage imagem, int rotacao) throws IOException {
        int colunas = quantidade(imagem.getWidth());
        int linhas = quantidade(imagem.getHeight());
        double larguraBloco = tamanhoRelativo(colunas);
        double alturaBloco = tamanhoRelativo(linhas);
        List<Bloco> blocos = new ArrayList<>();
        for (int linha = 0; linha < linhas; linha++) {
            for (int coluna = 0; coluna < colunas; coluna++) {
                double inicioX = inicio(coluna, colunas, larguraBloco);
                double inicioY = inicio(linha, linhas, alturaBloco);
                BufferedImage recorte = imagem.getSubimage(
                        (int) (inicioX * imagem.getWidth()),
                        (int) (inicioY * imagem.getHeight()),
                        Math.min((int) Math.ceil(larguraBloco * imagem.getWidth()), imagem.getWidth() - (int) (inicioX * imagem.getWidth())),
                        Math.min((int) Math.ceil(alturaBloco * imagem.getHeight()), imagem.getHeight() - (int) (inicioY * imagem.getHeight())));
                if (tinta(recorte) < TINTA_MINIMA) {
                    continue;
                }
                blocos.add(new Bloco(inicioX, inicioY, larguraBloco, alturaBloco, paraJpeg(recorte), normalizar(rotacao)));
            }
        }
        return blocos;
    }

    /** Fração de pixels escuros, por amostragem: separa papel em branco de desenho. */
    static double tinta(BufferedImage imagem) {
        int passo = 3;
        long escuros = 0;
        long total = 0;
        for (int y = 0; y < imagem.getHeight(); y += passo) {
            for (int x = 0; x < imagem.getWidth(); x += passo) {
                int rgb = imagem.getRGB(x, y);
                int luz = (((rgb >> 16) & 0xff) + ((rgb >> 8) & 0xff) + (rgb & 0xff)) / 3;
                if (luz < 160) {
                    escuros++;
                }
                total++;
            }
        }
        return total == 0 ? 0 : escuros / (double) total;
    }

    static int quantidade(int tamanho) {
        return Math.min(MAXIMO_POR_EIXO, Math.max(1, (int) Math.ceil(tamanho / (double) MAIOR_LADO_BLOCO)));
    }

    /** Tamanho do bloco em [0,1] para cobrir a página com a sobreposição definida. */
    static double tamanhoRelativo(int quantidade) {
        return quantidade == 1 ? 1d : 1d / (quantidade - (quantidade - 1) * SOBREPOSICAO);
    }

    static double inicio(int indice, int quantidade, double tamanho) {
        return quantidade == 1 ? 0d : indice * (1d - tamanho) / (quantidade - 1);
    }

    private static String paraJpeg(BufferedImage imagem) throws IOException {
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        ImageIO.write(imagem, "jpeg", saida);
        return Base64.getEncoder().encodeToString(saida.toByteArray());
    }
}
