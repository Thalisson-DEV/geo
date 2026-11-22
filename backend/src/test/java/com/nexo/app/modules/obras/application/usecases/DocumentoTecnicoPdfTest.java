package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.domain.EquipamentoObra;
import com.nexo.app.modules.obras.domain.EstruturaChecklist;
import com.nexo.app.modules.obras.domain.FichaAsBuilt;
import com.nexo.app.modules.obras.domain.ModeloChecklistObra;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.OrigemPlanejamento;
import com.nexo.app.modules.obras.domain.PontoPlanejamento;
import com.nexo.app.modules.obras.domain.RespostasChecklist;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class DocumentoTecnicoPdfTest {

    private static final UUID ID_OBRA = UUID.randomUUID();

    private static byte[] projeto(int paginas) throws IOException {
        try (PDDocument documento = new PDDocument(); ByteArrayOutputStream saida = new ByteArrayOutputStream()) {
            for (int i = 0; i < paginas; i++) {
                documento.addPage(new PDPage(PDRectangle.A3));
            }
            documento.save(saida);
            return saida.toByteArray();
        }
    }

    @Test
    void asBuiltLevaSoAsFolhasExecutadasEAsFichasMarcandoNaoSeAplica() throws IOException {
        PontoPlanejamento ponto = new PontoPlanejamento(ID_OBRA, "D381272", 2, new BigDecimal("0.5"), new BigDecimal("0.5"), OrigemPlanejamento.MANUAL);
        UUID idPonto = UUID.randomUUID();
        ReflectionTestUtils.setField(ponto, "id", idPonto);
        EstruturaChecklist estrutura = new EstruturaChecklist(List.of(new EstruturaChecklist.Grupo("Estrutura", List.of(
                new EstruturaChecklist.Pergunta("p1", "Aterramento", EstruturaChecklist.TipoPergunta.TEXTO, true, true, null)))));
        ModeloChecklistObra modelo = new ModeloChecklistObra(ModeloChecklistObra.Finalidade.AS_BUILT, "Ficha", null, estrutura);
        FichaAsBuilt ficha = new FichaAsBuilt(ID_OBRA, idPonto, modelo,
                RespostasChecklist.de(estrutura, List.of(new RespostasChecklist.Informada("p1", null, List.of(), true))));
        byte[] foto = FotoEvidencia.jpeg(new BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB), FotoEvidencia.LADO_DOCUMENTO, 0.78f);
        Obra obra = Mockito.mock(Obra.class);
        Mockito.when(obra.getNumero()).thenReturn("7000001");
        Mockito.when(obra.getTitulo()).thenReturn("Obra de teste");

        byte[] pdf = new DocumentoTecnicoPdf().asBuilt(new DocumentoTecnicoPdf.DadosAsBuilt(obra, 2, projeto(3), List.of(ponto), Set.of(idPonto),
                List.of(), Set.of(), List.of(ficha), List.of(new EquipamentoObra(ID_OBRA, idPonto, EquipamentoObra.Tipo.RELIGADOR, true, null)),
                Map.of(idPonto, List.of(new DocumentoTecnicoPdf.Foto("Aterramento", "Vista da haste", "01/11/2026 10:00 · ANA", foto), new DocumentoTecnicoPdf.Foto("Outras evidências", null, "01/11/2026 10:05", foto)))));

        try (PDDocument gerado = Loader.loadPDF(pdf)) {
            // Capa, sumário, a folha executada do projeto e o book.
            assertThat(gerado.getNumberOfPages()).isEqualTo(4);
            String texto = new PDFTextStripper().getText(gerado);
            assertThat(texto).contains("D381272", "Não se aplica", "N/A", "Religador com trafo auxiliar", "FOTO 01", "Aterramento", "Vista da haste",
                    "01/11/2026 10:00 · ANA", "FOTO 02", "Outras evidências");
            assertThat(texto).contains("AS BUILT", "ASB-7000001-R02", "CONTROLE DE EMISSÃO", "Registro (CREA/CFT)", "Sumário", "Folhas do projeto com o executado",
                    "Responsabilidade técnica", "Página 4 de 4");
            assertThat(gerado.getPage(3).getResources().getXObjectNames()).hasSize(2);
            assertThat(gerado.getPage(3).getResources().getXObject(gerado.getPage(3).getResources().getXObjectNames().iterator().next())).isInstanceOf(PDImageXObject.class);
        }
    }

    @Test
    void bookTemCapaSumarioEUmaSecaoPorPontoComAsFotosNaOrdemDaExecucao() throws IOException {
        byte[] foto = FotoEvidencia.jpeg(new BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB), FotoEvidencia.LADO_DOCUMENTO, 0.78f);
        Obra obra = Mockito.mock(Obra.class);
        Mockito.when(obra.getNumero()).thenReturn("7000002");
        Mockito.when(obra.getTitulo()).thenReturn("Extensão de rede");
        List<DocumentoTecnicoPdf.PontoBook> pontos = List.of(
                new DocumentoTecnicoPdf.PontoBook("P01", 1, true, "Completa", "Regulador", null, List.of(),
                        List.of(new DocumentoTecnicoPdf.Foto("Vista geral", null, "01/11/2026 09:00 · ANA", foto, "Antes"),
                                new DocumentoTecnicoPdf.Foto("Estrutura montada", "Poste novo", "01/11/2026 15:00 · ANA", foto, "Depois"))),
                new DocumentoTecnicoPdf.PontoBook("P02", 2, false, null, null, null, List.of("Aterramento"), List.of()));

        byte[] pdf = new DocumentoTecnicoPdf().book(new DocumentoTecnicoPdf.DadosBook(obra, 3, "ANA", pontos, 1, 1));

        try (PDDocument gerado = Loader.loadPDF(pdf)) {
            // Capa, sumário e uma página por ponto com foto; o ponto sem foto segue na mesma folha.
            assertThat(gerado.getNumberOfPages()).isEqualTo(3);
            String texto = new PDFTextStripper().getText(gerado);
            assertThat(texto).contains("BOOK FOTOGRÁFICO DE OBRA", "BKF-7000002-R03", "Obra 7000002", "Sumário", "Ponto P01", "Antes da execução (1)",
                    "Depois da execução (1)", "FOTO 01", "Vista geral · Antes", "Regulador", "Atenção: falta foto de Aterramento", "Página 3 de 3");
            assertThat(gerado.getPage(2).getResources().getXObjectNames()).hasSize(2);
        }
    }

    @Test
    void visitaTemCodigoComRevisaoParecerEFotoComHoraDaCamera() throws IOException {
        EstruturaChecklist estrutura = new EstruturaChecklist(List.of(new EstruturaChecklist.Grupo("Acesso", List.of(
                new EstruturaChecklist.Pergunta("v1", "Há acesso para veículos?", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Sim", "Não"), "Sim")))));
        ModeloChecklistObra modelo = new ModeloChecklistObra(ModeloChecklistObra.Finalidade.VISITA_PREVIA, "Pré-vistoria", null, estrutura);
        com.nexo.app.modules.obras.domain.VisitaPreviaObra visita = new com.nexo.app.modules.obras.domain.VisitaPreviaObra(ID_OBRA, modelo,
                java.time.LocalDate.of(2026, 11, 21), new com.nexo.app.modules.obras.domain.VisitaPreviaObra.Responsavel(null, "ARNALDO QUEIROZ"), null,
                RespostasChecklist.de(estrutura, List.of(new RespostasChecklist.Informada("v1", null, List.of("Não"), false))));
        byte[] foto = FotoEvidencia.jpeg(new BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB), FotoEvidencia.LADO_DOCUMENTO, 0.78f);
        Obra obra = Mockito.mock(Obra.class);
        Mockito.when(obra.getNumero()).thenReturn("7000003");
        Mockito.when(obra.getTitulo()).thenReturn("Reforço de rede");

        byte[] pdf = new DocumentoTecnicoPdf().visita(obra, visita, new EvidenciaVisitaPreviaUseCases.ParaDocumento(
                List.of(new DocumentoTecnicoPdf.Foto("Há acesso para veículos?", null, "Tirada em 21/11/2026 09:12 · ARNALDO QUEIROZ", foto, null, "9,42938° S · 40,48958° O")),
                List.of()), "JUAZEIRO");

        try (PDDocument gerado = Loader.loadPDF(pdf)) {
            String texto = new PDFTextStripper().getText(gerado);
            assertThat(texto).contains("VISITA PRÉVIA · REV. 01", "VTP-7000003-20261121-R01", "1 não conformidade apontada", "Não conforme",
                    "Tirada em 21/11/2026 09:12 · ARNALDO QUEIROZ", "GPS 9,42938° S · 40,48958° O", "JUAZEIRO", "1 foto anexada.");
        }
    }
}
