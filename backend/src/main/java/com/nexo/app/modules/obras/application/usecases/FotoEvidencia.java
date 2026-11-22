package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Collections;
import java.util.Iterator;
import java.util.Locale;

/**
 * Leitura das fotos do book. O celular grava a foto deitada e indica a posição no EXIF, que o ImageIO ignora; por isso
 * a orientação é aplicada aqui, antes de gerar a miniatura e o documento.
 */
final class FotoEvidencia {

    static final int LADO_MINIATURA = 480;
    static final int LADO_DOCUMENTO = 1400;
    private static final long MAXIMO_DE_PIXELS = 60_000_000L;
    private static final String FORMATO_INVALIDO = "Envie a foto em JPG ou PNG.";

    private FotoEvidencia() {
    }

    /** Recusa o que não é JPG nem PNG e foto grande demais para abrir com segurança. */
    static BufferedImage ler(byte[] conteudo) {
        try (ImageInputStream entrada = ImageIO.createImageInputStream(new ByteArrayInputStream(conteudo))) {
            Iterator<ImageReader> leitores = entrada == null ? Collections.emptyIterator() : ImageIO.getImageReaders(entrada);
            if (!leitores.hasNext()) {
                throw new InvarianteVioladaException(FORMATO_INVALIDO);
            }
            ImageReader leitor = leitores.next();
            try {
                String formato = leitor.getFormatName().toLowerCase(Locale.ROOT);
                if (!formato.equals("jpeg") && !formato.equals("png")) {
                    throw new InvarianteVioladaException(FORMATO_INVALIDO);
                }
                leitor.setInput(entrada);
                if ((long) leitor.getWidth(0) * leitor.getHeight(0) > MAXIMO_DE_PIXELS) {
                    throw new InvarianteVioladaException("A foto é grande demais. Envie uma de até 60 megapixels.");
                }
                return endireitar(leitor.read(0), orientacaoExif(conteudo));
            } finally {
                leitor.dispose();
            }
        } catch (IOException e) {
            throw new InvarianteVioladaException(FORMATO_INVALIDO);
        }
    }

    /** JPEG com o maior lado limitado. Transparência vira fundo branco. */
    static byte[] jpeg(BufferedImage imagem, int maiorLado, float qualidade) {
        double escala = Math.min(1d, maiorLado / (double) Math.max(imagem.getWidth(), imagem.getHeight()));
        int largura = Math.max(1, (int) Math.round(imagem.getWidth() * escala));
        int altura = Math.max(1, (int) Math.round(imagem.getHeight() * escala));
        BufferedImage saida = new BufferedImage(largura, altura, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = saida.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, largura, altura);
        g.drawImage(imagem, 0, 0, largura, altura, null);
        g.dispose();

        ImageWriter escritor = ImageIO.getImageWritersByFormatName("jpeg").next();
        ImageWriteParam parametros = escritor.getDefaultWriteParam();
        parametros.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        parametros.setCompressionQuality(qualidade);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (MemoryCacheImageOutputStream destino = new MemoryCacheImageOutputStream(bytes)) {
            escritor.setOutput(destino);
            escritor.write(null, new IIOImage(saida, null, null), parametros);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } finally {
            escritor.dispose();
        }
        return bytes.toByteArray();
    }

    private static BufferedImage endireitar(BufferedImage imagem, int orientacao) {
        if (orientacao <= 1 || orientacao > 8) {
            return imagem;
        }
        int l = imagem.getWidth();
        int a = imagem.getHeight();
        boolean deitada = orientacao >= 5;
        AffineTransform t = switch (orientacao) {
            case 2 -> new AffineTransform(-1, 0, 0, 1, l, 0);
            case 3 -> new AffineTransform(-1, 0, 0, -1, l, a);
            case 4 -> new AffineTransform(1, 0, 0, -1, 0, a);
            case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
            case 6 -> new AffineTransform(0, 1, -1, 0, a, 0);
            case 7 -> new AffineTransform(0, -1, -1, 0, a, l);
            default -> new AffineTransform(0, -1, 1, 0, 0, l);
        };
        BufferedImage saida = new BufferedImage(deitada ? a : l, deitada ? l : a, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = saida.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, saida.getWidth(), saida.getHeight());
        g.drawImage(imagem, t, null);
        g.dispose();
        return saida;
    }

    /** O que a câmera gravou na foto: quando foi tirada e onde (nulos quando o arquivo não traz). */
    public record Exif(java.time.LocalDateTime captura, Double latitude, Double longitude) {
        static final Exif VAZIO = new Exif(null, null, null);
    }

    /**
     * Data de captura (DateTimeOriginal, 0x9003) e posição (GPS, 0x8825) do EXIF de um JPEG. Arquivo sem EXIF, com EXIF
     * truncado ou que não é JPEG devolve vazio, nunca erro: é informação a mais para a legenda, não requisito.
     */
    public static Exif exif(byte[] b) {
        try {
            int[] tiff = segmentoTiff(b);
            if (tiff == null) {
                return Exif.VAZIO;
            }
            int inicio = tiff[0];
            int fim = tiff[1];
            boolean intel = b[inicio] == 'I';
            int ifd0 = inicio + inteiro(b, inicio + 4, 4, intel);
            Integer exifIfd = valorLong(b, inicio, fim, ifd0, 0x8769, intel);
            Integer gpsIfd = valorLong(b, inicio, fim, ifd0, 0x8825, intel);
            java.time.LocalDateTime captura = null;
            if (exifIfd != null) {
                String texto = ascii(b, inicio, fim, inicio + exifIfd, 0x9003, intel);
                if (texto != null && texto.length() >= 19) {
                    try {
                        captura = java.time.LocalDateTime.parse(texto.substring(0, 19),
                                java.time.format.DateTimeFormatter.ofPattern("yyyy:MM:dd HH:mm:ss"));
                    } catch (java.time.format.DateTimeParseException e) {
                        captura = null;
                    }
                }
            }
            Double latitude = null;
            Double longitude = null;
            if (gpsIfd != null) {
                int gps = inicio + gpsIfd;
                String refLat = ascii(b, inicio, fim, gps, 0x0001, intel);
                Double lat = graus(b, inicio, fim, gps, 0x0002, intel);
                String refLon = ascii(b, inicio, fim, gps, 0x0003, intel);
                Double lon = graus(b, inicio, fim, gps, 0x0004, intel);
                if (lat != null && lon != null && !(lat == 0 && lon == 0)) {
                    latitude = "S".equalsIgnoreCase(refLat) ? -lat : lat;
                    longitude = "W".equalsIgnoreCase(refLon) ? -lon : lon;
                }
            }
            return new Exif(captura, latitude, longitude);
        } catch (RuntimeException e) {
            return Exif.VAZIO;
        }
    }

    /** Início e fim do bloco TIFF dentro do APP1 "Exif" do JPEG; nulo quando não há. */
    private static int[] segmentoTiff(byte[] b) {
        if (b.length < 4 || (b[0] & 0xFF) != 0xFF || (b[1] & 0xFF) != 0xD8) {
            return null;
        }
        int i = 2;
        while (i + 4 <= b.length && (b[i] & 0xFF) == 0xFF) {
            int marcador = b[i + 1] & 0xFF;
            int tamanho = ((b[i + 2] & 0xFF) << 8) | (b[i + 3] & 0xFF);
            if (marcador == 0xDA || tamanho < 2) {
                return null;
            }
            if (marcador == 0xE1 && tamanho >= 16 && i + 2 + tamanho <= b.length
                    && b[i + 4] == 'E' && b[i + 5] == 'x' && b[i + 6] == 'i' && b[i + 7] == 'f') {
                return new int[]{i + 10, i + 2 + tamanho};
            }
            i += 2 + tamanho;
        }
        return null;
    }

    /** Posição (absoluta) da entrada {@code etiqueta} no diretório, ou -1. */
    private static int entrada(byte[] b, int fim, int diretorio, int etiqueta, boolean intel) {
        if (diretorio + 2 > fim) {
            return -1;
        }
        int entradas = inteiro(b, diretorio, 2, intel);
        for (int n = 0; n < entradas; n++) {
            int e = diretorio + 2 + n * 12;
            if (e + 12 > fim) {
                return -1;
            }
            if (inteiro(b, e, 2, intel) == etiqueta) {
                return e;
            }
        }
        return -1;
    }

    private static Integer valorLong(byte[] b, int inicio, int fim, int diretorio, int etiqueta, boolean intel) {
        int e = entrada(b, fim, diretorio, etiqueta, intel);
        return e < 0 ? null : inteiro(b, e + 8, 4, intel);
    }

    private static String ascii(byte[] b, int inicio, int fim, int diretorio, int etiqueta, boolean intel) {
        int e = entrada(b, fim, diretorio, etiqueta, intel);
        if (e < 0) {
            return null;
        }
        int quantos = inteiro(b, e + 4, 4, intel);
        int onde = quantos <= 4 ? e + 8 : inicio + inteiro(b, e + 8, 4, intel);
        if (quantos <= 0 || onde + quantos > fim) {
            return null;
        }
        return new String(b, onde, quantos, java.nio.charset.StandardCharsets.US_ASCII).replace("\0", "").trim();
    }

    /** Três racionais (graus, minutos, segundos) em graus decimais. */
    private static Double graus(byte[] b, int inicio, int fim, int diretorio, int etiqueta, boolean intel) {
        int e = entrada(b, fim, diretorio, etiqueta, intel);
        if (e < 0 || inteiro(b, e + 4, 4, intel) < 3) {
            return null;
        }
        int onde = inicio + inteiro(b, e + 8, 4, intel);
        if (onde + 24 > fim) {
            return null;
        }
        double[] partes = new double[3];
        for (int k = 0; k < 3; k++) {
            long num = inteiro(b, onde + k * 8, 4, intel) & 0xFFFFFFFFL;
            long den = inteiro(b, onde + k * 8 + 4, 4, intel) & 0xFFFFFFFFL;
            partes[k] = den == 0 ? 0 : (double) num / den;
        }
        return partes[0] + partes[1] / 60 + partes[2] / 3600;
    }

    /** Valor da etiqueta de orientação (0x0112) no segmento APP1 do JPEG; 1 quando não há. */
    static int orientacaoExif(byte[] b) {
        if (b.length < 4 || (b[0] & 0xFF) != 0xFF || (b[1] & 0xFF) != 0xD8) {
            return 1;
        }
        int i = 2;
        while (i + 4 <= b.length && (b[i] & 0xFF) == 0xFF) {
            int marcador = b[i + 1] & 0xFF;
            int tamanho = ((b[i + 2] & 0xFF) << 8) | (b[i + 3] & 0xFF);
            if (marcador == 0xDA || tamanho < 2) {
                return 1;
            }
            if (marcador == 0xE1 && tamanho >= 16 && i + 2 + tamanho <= b.length
                    && b[i + 4] == 'E' && b[i + 5] == 'x' && b[i + 6] == 'i' && b[i + 7] == 'f') {
                return orientacaoTiff(b, i + 10, i + 2 + tamanho);
            }
            i += 2 + tamanho;
        }
        return 1;
    }

    private static int orientacaoTiff(byte[] b, int inicio, int fim) {
        boolean intel = b[inicio] == 'I';
        int diretorio = inicio + inteiro(b, inicio + 4, 4, intel);
        if (diretorio < inicio || diretorio + 2 > fim) {
            return 1;
        }
        int entradas = inteiro(b, diretorio, 2, intel);
        for (int n = 0; n < entradas; n++) {
            int entrada = diretorio + 2 + n * 12;
            if (entrada + 12 > fim) {
                return 1;
            }
            if (inteiro(b, entrada, 2, intel) == 0x0112) {
                return inteiro(b, entrada + 8, 2, intel);
            }
        }
        return 1;
    }

    private static int inteiro(byte[] b, int posicao, int bytes, boolean intel) {
        int valor = 0;
        for (int n = 0; n < bytes; n++) {
            int deslocamento = intel ? n * 8 : (bytes - 1 - n) * 8;
            valor |= (b[posicao + n] & 0xFF) << deslocamento;
        }
        return valor;
    }
}
