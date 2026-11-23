package com.nexo.app.modules.obras.application.usecases;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static com.nexo.app.modules.obras.application.usecases.ArquivoDxfTest.pares;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class PlantaCadTest {

    /** DXF com tabela de camadas (uma desligada), um bloco de poste (círculo + texto) inserido girado e uma linha. */
    private static byte[] dxf() {
        String s = pares(0, "SECTION", 2, "TABLES")
                + pares(0, "TABLE", 2, "LAYER")
                + pares(0, "LAYER", 2, "REDE", 70, "0", 62, "3")
                + pares(0, "LAYER", 2, "DESLIGADA", 70, "0", 62, "-1")
                + pares(0, "ENDTAB")
                + pares(0, "ENDSEC")
                + pares(0, "SECTION", 2, "BLOCKS")
                + pares(0, "BLOCK", 8, "0", 2, "POSTE", 70, "0", 10, "0", 20, "0")
                + pares(0, "CIRCLE", 8, "0", 62, "0", 10, "0", 20, "0", 40, "1")
                + pares(0, "TEXT", 8, "0", 62, "0", 1, "P", 10, "2", 20, "0", 40, "1")
                + pares(0, "ENDBLK", 8, "0")
                + pares(0, "ENDSEC")
                + pares(0, "SECTION", 2, "ENTITIES")
                + pares(0, "INSERT", 8, "REDE", 2, "POSTE", 10, "1000", 20, "2000", 50, "90", 62, "6")
                + pares(0, "LINE", 8, "REDE", 10, "1000", 20, "2000", 11, "1100", 21, "2000")
                + pares(0, "LINE", 8, "DESLIGADA", 10, "0", 20, "0", 11, "1", 21, "1")
                + pares(0, "TEXT", 8, "REDE", 1, "Chave Fusível", 10, "1050", 20, "2005", 40, "2")
                + pares(0, "ENDSEC") + pares(0, "EOF");
        return s.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void expandeOsBlocosResolveAsCoresEPulaCamadaDesligada() {
        GeometriaDxf.Desenho desenho = GeometriaDxf.ler(dxf());

        // Círculo do bloco + linha da rede; a linha da camada desligada não entra.
        assertThat(desenho.formas()).hasSize(2);
        GeometriaDxf.Forma circulo = desenho.formas().getFirst();
        // Cor "por bloco" herda a do INSERT (6, magenta); o bloco foi girado 90° e posto em (1000, 2000).
        assertThat(circulo.cor()).isEqualTo(GeometriaDxf.rgb(6));
        assertThat(circulo.pontos().getFirst()[0]).isCloseTo(1000, within(1e-6));
        assertThat(circulo.pontos().getFirst()[1]).isCloseTo(2001, within(1e-6));
        assertThat(desenho.formas().get(1).cor()).isEqualTo(GeometriaDxf.rgb(3));
        GeometriaDxf.TextoDesenho doBloco = desenho.textos().stream().filter(t -> t.texto().equals("P")).findFirst().orElseThrow();
        assertThat(doBloco.x()).isCloseTo(1000, within(1e-6));
        assertThat(doBloco.y()).isCloseTo(2002, within(1e-6));
        assertThat(doBloco.rotacao()).isCloseTo(90, within(1e-6));
    }

    @Test
    void geraAPlantaEmEscalaPadraoComAGeorreferenciaGravadaNoPdf() throws Exception {
        GeometriaDxf.Desenho desenho = GeometriaDxf.ler(dxf());
        double[] janela = {850, 1900, 1250, 2100};

        GeradorPlantaCad.Planta planta = new GeradorPlantaCad().gerar(desenho, janela, "projeto.dxf", "Obra 123 — Ramal");

        // 400 m × 200 m cabem em A3 deitada a 1:1.000 (a 1:500 não cabem).
        assertThat(planta.escala()).isEqualTo(1000);
        assertThat(planta.folha()).isEqualTo("A3");
        try (PDDocument pdf = Loader.loadPDF(planta.pdf())) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(1);
            String texto = new PDFTextStripper().getText(pdf);
            assertThat(texto).contains("Obra 123", "projeto.dxf", "1:1.000", "Chave Fusível");
        }
        LeitorVetorialProjeto.Georreferencia geo = GeradorPlantaCad.georreferenciaGravada(planta.pdf(), 1).orElseThrow();
        // O centro da janela fica no centro da área de desenho; 1:1.000 é 0,3528 m por ponto.
        double[] centro = geo.naFolha(1050, 2000);
        assertThat(centro[0]).isCloseTo(0.5, within(0.001));
        assertThat(geo.metrosPorPonto()).isCloseTo(0.0254 / 72 * 1000, within(1e-9));
        // Norte para cima: um ponto mais ao norte fica mais acima na folha.
        assertThat(geo.naFolha(1050, 2040)[1]).isLessThan(centro[1]);
        // Em outra página, ou num PDF qualquer, não há georreferência gravada.
        assertThat(GeradorPlantaCad.georreferenciaGravada(planta.pdf(), 2)).isEmpty();
    }

    @Test
    void caixinhaDeTextoProjetadoNaoEntraNaPlantaMasARedeNovaSim() {
        var caixinha = new GeometriaDxf.Forma("TEXTO_PG_NUMERO_PROJ", 0, java.util.List.of(new double[]{0, 0}, new double[]{1.8, 0},
                new double[]{1.8, 2.2}, new double[]{0, 2.2}, new double[]{0, 0}), false);
        var indicador = new GeometriaDxf.Forma("TEXTO_INDICADOR", 0, java.util.List.of(new double[]{0, 0}, new double[]{1, 1}), false);
        var redeNova = new GeometriaDxf.Forma("TRECHO_SECUNDARIO_PROJ", 0, java.util.List.of(new double[]{0, 0}, new double[]{1, 1}), false);

        assertThat(GeradorPlantaCad.marcacaoDeTexto(caixinha)).isTrue();
        assertThat(GeradorPlantaCad.marcacaoDeTexto(indicador)).isFalse();
        assertThat(GeradorPlantaCad.marcacaoDeTexto(redeNova)).isFalse();
    }

    @Test
    void obraGrandeVaiEmA1() {
        GeometriaDxf.Desenho desenho = GeometriaDxf.ler(dxf());
        GeradorPlantaCad.Planta planta = new GeradorPlantaCad().gerar(desenho, new double[]{0, 0, 4000, 2000}, "rede.dxf", null);
        assertThat(planta.folha()).isEqualTo("A1");
        assertThat(planta.escala()).isEqualTo(10000);
    }
}
