package com.nexo.app.modules.obras.application.usecases;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class LeitorVetorialProjetoTest {

    private static final Map<Character, JsonNode> GLIFOS = carregar();

    /** Texto escrito como o programa de projeto exporta: uma forma preenchida por letra, em pontos de PDF. */
    private record Texto(String texto, double x, double y, double altura, double grausAntiHorario, float[] cor) {
    }

    @Test
    void leLetrasDesenhadasComoPoligonosNaHorizontalEInclinadas() throws Exception {
        byte[] pdf = pdf(List.of(
                new Texto("00000003", 200, 600, 4, 0, new float[]{1, 0, 1}),
                new Texto("DT 9/300", 200, 593, 4, 0, new float[]{1, 0, 1}),
                new Texto("500450 / 8000142", 200, 586, 4, 0, new float[]{1, 0, 1}),
                new Texto("ESSS3IF", 350, 600, 4, 0, new float[]{0, 0, 0}),
                new Texto("33m AN 1 #35(35) MULT", 100, 400, 4, 35, new float[]{1, 0, 1})));

        List<ReconhecedorGlifos.Linha> linhas;
        try (PDDocument documento = Loader.loadPDF(pdf)) {
            linhas = ReconhecedorGlifos.ler(ExtratorVetorialPdf.extrair(documento.getPage(0)).glifos());
        }

        assertThat(linhas).extracting(l -> LeitorVetorialProjeto.corrigir(l.texto()))
                .contains("00000003", "DT 9/300", "500450 / 8000142", "ESSS3IF", "33m AN 1 #35(35) MULT");
        ReconhecedorGlifos.Linha inclinada = linhas.stream().filter(l -> l.texto().startsWith("33m")).findFirst().orElseThrow();
        // y da tela desce: texto subindo 35° para a direita fica com ângulo de -35°.
        assertThat(inclinada.angulo()).isBetween(-37.0, -33.0);
        assertThat(inclinada.cor()).isEqualTo(0xFF00FF);
    }

    @Test
    void pdfSemLetrasDesenhadasNaoUsaLeituraVetorial() throws Exception {
        assertThat(new LeitorVetorialProjeto().ler(pdf(List.of(new Texto("123", 100, 100, 4, 0, new float[]{0, 0, 0}))), 1)).isEmpty();
    }

    @Test
    void georreferenciaRecuperaEscalaEPosicaoPelaUtm() {
        // Folha em 1:1000 (0,3528 m por ponto), girada 10° em relação ao norte.
        double mpp = 0.0254 / 72 * 1000;
        double ang = Math.toRadians(10);
        double a = Math.cos(ang) / mpp;
        double b = Math.sin(ang) / mpp;
        LeitorVetorialProjeto.Semelhanca real = new LeitorVetorialProjeto.Semelhanca(a, b, 300, 400, 500450, 8000142);
        List<double[]> utm = List.of(new double[]{500419, 8000158}, new double[]{500505, 8000136}, new double[]{500477, 8000106},
                new double[]{500525, 8000164});
        List<double[]> folha = new ArrayList<>(utm.stream().map(real::aplicar).toList());
        // Um par trocado (rótulo ligado ao símbolo errado) não pode puxar a conta.
        folha.set(3, new double[]{folha.get(3)[0] + 40, folha.get(3)[1] - 25});

        LeitorVetorialProjeto.Semelhanca ajustada = LeitorVetorialProjeto.Semelhanca.ajustar(utm, folha);

        assertThat(ajustada.metrosPorPonto()).isCloseTo(mpp, org.assertj.core.data.Offset.offset(0.002));
        double[] previsto = ajustada.aplicar(new double[]{500450, 8000142});
        assertThat(previsto[0]).isCloseTo(300, org.assertj.core.data.Offset.offset(0.5));
        assertThat(previsto[1]).isCloseTo(400, org.assertj.core.data.Offset.offset(0.5));
    }

    @Test
    void numeracaoSegueAOrdemDaRedeInformadaPelaLeitura() {
        // Códigos provisórios fora de ordem (8, 3, 4) e o poste existente de onde a rede sai: a numeração segue a rede.
        String leitura = """
                {"pontos":[
                 {"id":"00000004","numero":null,"barramento":null,"tipo":"POSTE","x":0.2,"y":0.3,"estruturas":["S3I"],"ordem":4,"confianca":0.95},
                 {"id":"00000003","numero":null,"barramento":null,"tipo":"POSTE","x":0.3,"y":0.4,"estruturas":["S1I"],"ordem":3,"confianca":0.95},
                 {"id":"10000035","numero":null,"barramento":"10000035","tipo":"POSTE","x":0.45,"y":0.55,"estruturas":["S3I"],"ordem":1,"confianca":0.95},
                 {"id":"00000008","numero":null,"barramento":null,"tipo":"POSTE","x":0.44,"y":0.5,"estruturas":["S4I"],"ordem":2,"confianca":0.9}],
                 "vaos":[{"de":"00000003","para":"00000004","metragem":36},{"de":"00000008","para":"00000003","metragem":33},
                         {"de":"10000035","para":"00000008","metragem":null}]}
                """;
        InterpretadorPropostaProjeto interpretador = new InterpretadorPropostaProjeto(1, List.of(), List.of());
        assertThat(interpretador.tentarBloco(leitura, new RenderizadorPaginaProjeto.Bloco(0, 0, 1, 1, null, 0))).isTrue();

        var proposta = interpretador.concluir();

        assertThat(proposta.pontos()).extracting(p -> p.numero() + ":" + (p.barramento() != null ? p.barramento() : p.textosLidos().getFirst()))
                .containsExactly("1:10000035", "2:S4I", "3:S1I", "4:S3I");
        assertThat(proposta.vaos()).hasSize(3);
    }

    @Test
    void corrigeIMinusculoEReconheceCoordenadaIlegivel() {
        assertThat(LeitorVetorialProjeto.corrigir("ESSS3lF")).isEqualTo("ESSS3IF");
        assertThat(LeitorVetorialProjeto.corrigir("S3 l")).isEqualTo("S3I");
        assertThat(LeitorVetorialProjeto.corrigir("33m AN 1")).isEqualTo("33m AN 1");
        assertThat(LeitorVetorialProjeto.coordenadaIlegivel("H(174uf4 / 9456196")).isTrue();
        assertThat(LeitorVetorialProjeto.coordenadaIlegivel("S3I+S3I")).isFalse();
    }

    @Test
    void cruzamentoAchaOXDeTextoRiscado() {
        var p = new ExtratorVetorialPdf.Segmento(0, 0, 4, 4, 0, 0.2, false);
        var q = new ExtratorVetorialPdf.Segmento(0, 4, 4, 0, 0, 0.2, false);
        var paralelo = new ExtratorVetorialPdf.Segmento(0, 1, 4, 5, 0, 0.2, false);
        assertThat(LeitorVetorialProjeto.cruzamento(p, q)).containsExactly(2.0, 2.0);
        assertThat(LeitorVetorialProjeto.cruzamento(p, paralelo)).isNull();
    }

    private static byte[] pdf(List<Texto> textos) throws Exception {
        try (PDDocument documento = new PDDocument(); ByteArrayOutputStream saida = new ByteArrayOutputStream()) {
            PDPage pagina = new PDPage(PDRectangle.A4);
            documento.addPage(pagina);
            try (PDPageContentStream conteudo = new PDPageContentStream(documento, pagina)) {
                for (Texto t : textos) {
                    desenhar(conteudo, t);
                }
            }
            documento.save(saida);
            return saida.toByteArray();
        }
    }

    /** Cada letra vira um polígono preenchido, como no PDF exportado pelo programa de projeto. */
    private static void desenhar(PDPageContentStream conteudo, Texto t) throws Exception {
        conteudo.setNonStrokingColor(t.cor()[0], t.cor()[1], t.cor()[2]);
        double c = Math.cos(Math.toRadians(t.grausAntiHorario()));
        double s = Math.sin(Math.toRadians(t.grausAntiHorario()));
        double avanco = 0;
        for (char letra : t.texto().toCharArray()) {
            JsonNode g = GLIFOS.get(letra);
            if (g == null) {
                avanco += 0.35;
                continue;
            }
            double minX = Double.MAX_VALUE;
            double maxX = -Double.MAX_VALUE;
            for (JsonNode contorno : g.path("contornos")) {
                for (int k = 0; k < contorno.size(); k += 2) {
                    minX = Math.min(minX, contorno.get(k).asDouble());
                    maxX = Math.max(maxX, contorno.get(k).asDouble());
                }
            }
            double inicio = avanco + g.path("lsb").asDouble() - minX;
            for (JsonNode contorno : g.path("contornos")) {
                for (int k = 0; k < contorno.size(); k += 2) {
                    // Contorno do modelo: x para a direita, y para baixo, em alturas de maiúscula.
                    double lx = (contorno.get(k).asDouble() + inicio) * t.altura();
                    double ly = -contorno.get(k + 1).asDouble() * t.altura();
                    float x = (float) (t.x() + lx * c - ly * s);
                    float y = (float) (t.y() + lx * s + ly * c);
                    if (k == 0) {
                        conteudo.moveTo(x, y);
                    } else {
                        conteudo.lineTo(x, y);
                    }
                }
                conteudo.closePath();
            }
            conteudo.fillEvenOdd();
            avanco += g.path("lsb").asDouble() + (maxX - minX) + g.path("rsb").asDouble();
        }
    }

    private static Map<Character, JsonNode> carregar() {
        try (InputStream entrada = LeitorVetorialProjetoTest.class.getResourceAsStream("/projeto/glifos-modelo.json")) {
            Map<Character, JsonNode> mapa = new HashMap<>();
            for (JsonNode g : new ObjectMapper().readTree(entrada).path("glifos")) {
                mapa.put(g.path("c").asText().charAt(0), g);
            }
            return mapa;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
