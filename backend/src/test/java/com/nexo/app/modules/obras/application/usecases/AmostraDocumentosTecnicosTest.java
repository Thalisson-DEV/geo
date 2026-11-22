package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.domain.EquipamentoObra;
import com.nexo.app.modules.obras.domain.EstruturaChecklist;
import com.nexo.app.modules.obras.domain.FichaAsBuilt;
import com.nexo.app.modules.obras.domain.ModeloChecklistObra;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.OrigemPlanejamento;
import com.nexo.app.modules.obras.domain.PontoPlanejamento;
import com.nexo.app.modules.obras.domain.RespostasChecklist;
import com.nexo.app.modules.obras.domain.VaoPlanejamento;
import com.nexo.app.modules.obras.domain.VisitaPreviaObra;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Amostras visuais dos PDFs técnicos. Só roda com -Damostra.dir=<pasta> (não faz parte da bateria). */
class AmostraDocumentosTecnicosTest {

    private static final UUID ID_OBRA = UUID.randomUUID();

    @Test
    void gerarAmostras() throws IOException {
        String dir = System.getProperty("amostra.dir");
        Assumptions.assumeTrue(dir != null && !dir.isBlank());
        Path pasta = Path.of(dir);
        Files.createDirectories(pasta);
        Obra obra = Mockito.mock(Obra.class);
        Mockito.when(obra.getNumero()).thenReturn("7100001");
        Mockito.when(obra.getTitulo()).thenReturn("Extensão de rede BT · Rua das Palmeiras, trecho entre os postes 1 e 4");
        Mockito.when(obra.getEndereco()).thenReturn("Rua das Palmeiras, s/n · Bairro Centro");
        Mockito.when(obra.getNotaObra()).thenReturn("4100238811");
        Mockito.when(obra.getLatitude()).thenReturn(-9.42938);
        Mockito.when(obra.getLongitude()).thenReturn(-40.48958);

        DocumentoTecnicoPdf pdf = new DocumentoTecnicoPdf();
        salvar(pasta, "visita", pdf.visita(obra, visita(), new EvidenciaVisitaPreviaUseCases.ParaDocumento(List.of(
                foto("Há acesso para veículos e equipamentos?", "Rua asfaltada, acesso livre", "Tirada em 21/11/2026 09:12 · ARNALDO QUEIROZ", null, 0),
                foto("Existe árvore ou obstáculo na faixa da rede?", "Mangueira junto ao poste 3", "21/11/2026 09:20 · ARNALDO QUEIROZ", null, 1),
                foto("Evidência geral", null, "21/11/2026 09:25 · ARNALDO QUEIROZ", null, 2)), List.of("Croqui da visita: croqui.pdf")), "JUAZEIRO"));

        List<PontoPlanejamento> pontos = new ArrayList<>();
        Map<UUID, List<DocumentoTecnicoPdf.Foto>> fotos = new HashMap<>();
        List<FichaAsBuilt> fichas = new ArrayList<>();
        ModeloChecklistObra modelo = new ModeloChecklistObra(ModeloChecklistObra.Finalidade.AS_BUILT, "Ficha As Built com fotos", null, estruturaFicha());
        for (int i = 1; i <= 4; i++) {
            PontoPlanejamento p = new PontoPlanejamento(ID_OBRA, String.valueOf(i), 1, new BigDecimal("0." + (1 + i * 2)), new BigDecimal("0.55"), OrigemPlanejamento.MANUAL);
            ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
            pontos.add(p);
            fotos.put(p.getId(), List.of(
                    foto("Entorno", null, "22/11/2026 08:1" + i + " · DIEGO F. ARAÚJO", "Antes", i),
                    foto("Aterramento", "Haste cravada e conexão", "22/11/2026 09:2" + i + " · DIEGO F. ARAÚJO", "Durante", i + 1),
                    foto("Poste instalado", null, "22/11/2026 10:4" + i + " · DIEGO F. ARAÚJO", "Depois", i + 2)));
            fichas.add(new FichaAsBuilt(ID_OBRA, p.getId(), modelo, RespostasChecklist.de(modelo.getEstrutura(), List.of(
                    new RespostasChecklist.Informada("f1", null, List.of("Concreto DT 11/300"), false),
                    new RespostasChecklist.Informada("f2", null, List.of("Sim"), false),
                    new RespostasChecklist.Informada("f3", "12.5", List.of(), false),
                    new RespostasChecklist.Informada("f4", null, List.of(), i == 2),
                    new RespostasChecklist.Informada("f5", i == 3 ? "Cruzeta trocada por avaria no transporte; mantida a mesma especificação." : null, List.of(), i != 3)))));
        }
        List<VaoPlanejamento> vaos = new ArrayList<>();
        Set<UUID> vaosExecutados = new java.util.HashSet<>();
        for (int i = 0; i < 3; i++) {
            VaoPlanejamento v = Mockito.mock(VaoPlanejamento.class);
            UUID id = UUID.randomUUID();
            Mockito.when(v.getId()).thenReturn(id);
            Mockito.when(v.getIdPontoA()).thenReturn(pontos.get(i).getId());
            Mockito.when(v.getIdPontoB()).thenReturn(pontos.get(i + 1).getId());
            vaos.add(v);
            vaosExecutados.add(id);
        }
        Set<UUID> executados = Set.of(pontos.get(0).getId(), pontos.get(1).getId(), pontos.get(2).getId(), pontos.get(3).getId());
        salvar(pasta, "asbuilt", pdf.asBuilt(new DocumentoTecnicoPdf.DadosAsBuilt(obra, 2, projeto(), pontos, executados, vaos, vaosExecutados, fichas,
                List.of(new EquipamentoObra(ID_OBRA, pontos.get(1).getId(), EquipamentoObra.Tipo.RELIGADOR, true, "Série 88213")), fotos, "JUAZEIRO")));

        List<DocumentoTecnicoPdf.PontoBook> doBook = new ArrayList<>();
        for (int i = 0; i < pontos.size(); i++) {
            PontoPlanejamento p = pontos.get(i);
            doBook.add(new DocumentoTecnicoPdf.PontoBook(p.getNumero(), 1, true, i == 3 ? "Falta 1 resposta" : "Completa", i == 1 ? "Religador com trafo auxiliar · Série 88213" : null,
                    fichas.get(i).getRespostas(), i == 3 ? List.of("Placa do equipamento") : List.of(), fotos.get(p.getId())));
        }
        salvar(pasta, "book", pdf.book(new DocumentoTecnicoPdf.DadosBook(obra, 3, "ADMTESTE", doBook, 4, 3, "JUAZEIRO")));
    }

    private static EstruturaChecklist estruturaFicha() {
        return new EstruturaChecklist(List.of(
                new EstruturaChecklist.Grupo("Estrutura", List.of(
                        new EstruturaChecklist.Pergunta("f1", "Tipo de poste instalado", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Concreto DT 11/300", "Concreto DT 12/600")),
                        new EstruturaChecklist.Pergunta("f2", "Estrutura conforme o projeto?", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Sim", "Não"), "Sim"))),
                new EstruturaChecklist.Grupo("Aterramento", List.of(
                        new EstruturaChecklist.Pergunta("f3", "Resistência de aterramento medida (Ω)", EstruturaChecklist.TipoPergunta.NUMERO, true, false, null),
                        new EstruturaChecklist.Pergunta("f4", "Medição com terrômetro aferido", EstruturaChecklist.TipoPergunta.TEXTO, false, true, null))),
                new EstruturaChecklist.Grupo("Observações", List.of(
                        new EstruturaChecklist.Pergunta("f5", "Alterações em relação ao projeto", EstruturaChecklist.TipoPergunta.TEXTO, false, true, null)))));
    }

    private static VisitaPreviaObra visita() {
        EstruturaChecklist e = new EstruturaChecklist(List.of(
                new EstruturaChecklist.Grupo("Acesso e logística", List.of(
                        new EstruturaChecklist.Pergunta("v1", "Há acesso para veículos e equipamentos?", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Sim", "Não"), "Sim"),
                        new EstruturaChecklist.Pergunta("v2", "O acesso requer autorização?", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Sim", "Não"), "Não"),
                        new EstruturaChecklist.Pergunta("v3", "Veículo que chega até os pontos", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Caminhão com guindauto", "Pick-up"), "Caminhão com guindauto"),
                        new EstruturaChecklist.Pergunta("v4", "Distância da base (km)", EstruturaChecklist.TipoPergunta.NUMERO, true, false, null))),
                new EstruturaChecklist.Grupo("Condições da rede", List.of(
                        new EstruturaChecklist.Pergunta("v5", "Existe árvore ou obstáculo na faixa da rede?", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Sim", "Não"), "Não"),
                        new EstruturaChecklist.Pergunta("v6", "Precisa de desligamento?", EstruturaChecklist.TipoPergunta.ESCOLHA_UNICA, true, false, List.of("Sim", "Não")),
                        new EstruturaChecklist.Pergunta("v7", "Data prevista de início", EstruturaChecklist.TipoPergunta.DATA, false, true, null)))));
        ModeloChecklistObra modelo = new ModeloChecklistObra(ModeloChecklistObra.Finalidade.VISITA_PREVIA, "Pré-vistoria de obra", null, e);
        RespostasChecklist r = RespostasChecklist.de(e, List.of(
                new RespostasChecklist.Informada("v1", null, List.of("Sim"), false),
                new RespostasChecklist.Informada("v2", null, List.of("Não"), false),
                new RespostasChecklist.Informada("v3", null, List.of("Caminhão com guindauto"), false),
                new RespostasChecklist.Informada("v4", "3", List.of(), false),
                new RespostasChecklist.Informada("v5", null, List.of("Sim"), false),
                new RespostasChecklist.Informada("v6", null, List.of("Sim"), false),
                new RespostasChecklist.Informada("v7", "2026-11-23", List.of(), false)));
        return new VisitaPreviaObra(ID_OBRA, modelo, LocalDate.of(2026, 11, 21), new VisitaPreviaObra.Responsavel(null, "ARNALDO QUEIROZ"),
                "Poda da mangueira junto ao poste 3 antes da execução. Morador avisado sobre o desligamento programado.", r);
    }

    private static DocumentoTecnicoPdf.Foto foto(String item, String legenda, String autoria, String etapa, int variacao) throws IOException {
        BufferedImage img = new BufferedImage(1600, 1200, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setPaint(new GradientPaint(0, 0, new Color(120 + variacao * 8, 160, 200), 0, 700, new Color(205, 215, 222)));
        g.fillRect(0, 0, 1600, 720);
        g.setPaint(new GradientPaint(0, 720, new Color(110, 108, 92), 0, 1200, new Color(70, 68, 58)));
        g.fillRect(0, 720, 1600, 480);
        g.setColor(new Color(155, 155, 148));
        g.fillRect(740 + variacao * 30, 140, 70, 900);
        g.setColor(new Color(90, 90, 90));
        g.fillRect(560 + variacao * 30, 250, 430, 36);
        g.setStroke(new BasicStroke(4));
        g.setColor(new Color(30, 30, 30));
        g.drawLine(0, 270, 1600, 236);
        g.dispose();
        byte[] jpeg = FotoEvidencia.jpeg(img, FotoEvidencia.LADO_DOCUMENTO, 0.78f);
        return new DocumentoTecnicoPdf.Foto(item, legenda, autoria, jpeg, etapa, GeracaoAsBuiltService.coordenadas(-9.42938, -40.48958) + " · ±8 m",
                GeracaoAsBuiltService.codigoDaFoto(UUID.randomUUID()));
    }

    private static byte[] projeto() throws IOException {
        try (PDDocument d = new PDDocument(); ByteArrayOutputStream saida = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(new PDRectangle(PDRectangle.A3.getHeight(), PDRectangle.A3.getWidth()));
            d.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(d, page)) {
                cs.setStrokingColor(new Color(0.85f, 0.85f, 0.85f));
                for (int x = 0; x < 1191; x += 40) { cs.moveTo(x, 0); cs.lineTo(x, 842); }
                cs.stroke();
                cs.setNonStrokingColor(new Color(0.8f, 0.8f, 0.8f));
                cs.addRect(0, 842 * 0.42f, 1191, 50);
                cs.fill();
                cs.setStrokingColor(Color.BLACK);
                cs.setLineWidth(2);
                cs.moveTo(1191 * 0.3f, 842 * 0.45f);
                cs.lineTo(1191 * 0.9f, 842 * 0.45f);
                cs.stroke();
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 18);
                cs.newLineAtOffset(40, 800);
                cs.showText("PROJETO DE TESTE - FOLHA 1");
                cs.endText();
            }
            d.save(saida);
            return saida.toByteArray();
        }
    }

    private static void salvar(Path pasta, String nome, byte[] pdf) throws IOException {
        Files.write(pasta.resolve(nome + ".pdf"), pdf);
        try (PDDocument d = Loader.loadPDF(pdf)) {
            PDFRenderer r = new PDFRenderer(d);
            for (int i = 0; i < d.getNumberOfPages(); i++) {
                ImageIO.write(r.renderImageWithDPI(i, 80), "png", new File(pasta.toFile(), nome + "-" + (i + 1) + ".png"));
            }
        }
    }
}
