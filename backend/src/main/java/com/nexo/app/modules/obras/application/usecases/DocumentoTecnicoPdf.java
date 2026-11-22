package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.domain.EquipamentoObra;
import com.nexo.app.modules.obras.domain.EstruturaChecklist;
import com.nexo.app.modules.obras.domain.FichaAsBuilt;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.OperacaoItemKit;
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
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.util.Matrix;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * PDFs da documentação técnica, no formato de documento de engenharia: capa com identificação, indicadores, controle de
 * emissão e campos de aprovação; em toda folha, o cabeçalho com tipo, obra, código e data de emissão, e o rodapé com a
 * paginação; seções numeradas, checklist em tabela com a situação de cada item e registro fotográfico com fotos
 * numeradas. As coordenadas de ponto e vão são relativas à página sem rotação (D3), a partir do canto superior esquerdo.
 * Usa as fontes padrão do PDF; caractere fora do conjunto delas é trocado por um equivalente ou vira "?".
 */
@Component
public class DocumentoTecnicoPdf {

    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DATA_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final DateTimeFormatter DATA_CODIGO = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final Locale PT_BR = Locale.of("pt", "BR");

    static final Color TEXTO = new Color(0x0f, 0x17, 0x2a);
    static final Color SUAVE = new Color(0x47, 0x55, 0x69);
    static final Color DIVISOR = new Color(0xcb, 0xd5, 0xe1);
    static final Color BORDA = new Color(0x94, 0xa3, 0xb8);
    static final Color FUNDO = new Color(0xf1, 0xf5, 0xf9);
    static final Color FUNDO_FORTE = new Color(0xe2, 0xe8, 0xf0);
    static final Color ACENTO = new Color(0x1d, 0x4e, 0xd8);
    static final Color EXECUTADO = new Color(0x15, 0x80, 0x3d);
    static final Color ERRO = new Color(0xb9, 0x1c, 0x1c);
    static final Color ATENCAO = new Color(0xb4, 0x53, 0x09);
    static final Color FUNDO_OK = new Color(0xf0, 0xfd, 0xf4);
    static final Color FUNDO_ATENCAO = new Color(0xff, 0xfb, 0xeb);
    static final Color FUNDO_ERRO = new Color(0xfe, 0xf2, 0xf2);

    private static final float LARGURA_A4 = PDRectangle.A4.getWidth();
    private static final float ALTURA_A4 = PDRectangle.A4.getHeight();
    private static final float MARGEM = 48;

    public record DadosAsBuilt(Obra obra, int numeroVersao, byte[] projeto, List<PontoPlanejamento> pontos, Set<UUID> pontosExecutados,
                               List<VaoPlanejamento> vaos, Set<UUID> vaosExecutados, List<FichaAsBuilt> fichas, List<EquipamentoObra> equipamentos,
                               Map<UUID, List<Foto>> fotos, String municipio) {

        public DadosAsBuilt(Obra obra, int numeroVersao, byte[] projeto, List<PontoPlanejamento> pontos, Set<UUID> pontosExecutados,
                            List<VaoPlanejamento> vaos, Set<UUID> vaosExecutados, List<FichaAsBuilt> fichas, List<EquipamentoObra> equipamentos,
                            Map<UUID, List<Foto>> fotos) {
            this(obra, numeroVersao, projeto, pontos, pontosExecutados, vaos, vaosExecutados, fichas, equipamentos, fotos, null);
        }
    }

    /**
     * Foto do documento, já em JPEG no tamanho do documento. {@code etapa} é o rótulo (Antes, Durante, Depois) ou nulo;
     * {@code local}, a posição de captura já escrita (coordenadas e precisão) ou nulo.
     */
    public record Foto(String item, String legenda, String autoria, byte[] jpeg, String etapa, String local, String codigo) {
        public Foto(String item, String legenda, String autoria, byte[] jpeg, String etapa, String local) {
            this(item, legenda, autoria, jpeg, etapa, local, null);
        }

        public Foto(String item, String legenda, String autoria, byte[] jpeg, String etapa) {
            this(item, legenda, autoria, jpeg, etapa, null, null);
        }

        public Foto(String item, String legenda, String autoria, byte[] jpeg) {
            this(item, legenda, autoria, jpeg, null, null, null);
        }
    }

    /** Book fotográfico: capa com o resumo, sumário e uma seção por ponto. */
    public record DadosBook(Obra obra, int numeroVersao, String geradoPor, List<PontoBook> pontos, int pontosExecutados, int fichasCompletas,
                            String municipio) {
        public DadosBook(Obra obra, int numeroVersao, String geradoPor, List<PontoBook> pontos, int pontosExecutados, int fichasCompletas) {
            this(obra, numeroVersao, geradoPor, pontos, pontosExecutados, fichasCompletas, null);
        }
    }

    /**
     * Um ponto do book. {@code ficha} é a situação já escrita ("Completa", "Faltam 2 respostas", "Sem ficha"); {@code respostas}
     * só vem quando há ficha; {@code fotosFaltando} são os itens obrigatórios do modelo ainda sem foto.
     */
    public record PontoBook(String numero, int pagina, boolean executado, String ficha, String equipamento, RespostasChecklist respostas,
                            List<String> fotosFaltando, List<Foto> fotos) {
    }

    private record EntradaSumario(String titulo, String detalhe, int pagina) {
    }

    /** O que vai no cabeçalho de toda folha: tipo do documento, obra, código e emissão. */
    private record Folha(String tipo, String obra, String codigo, String emissao) {
    }

    /** Capa: identificação, indicadores, controle de emissão e os campos de aprovação. */
    private record Capa(String tipo, String titulo, String subtitulo, List<String[]> identificacao, List<String[]> indicadores,
                        String[] emissao, List<String[]> aprovacao, String codigo) {
    }

    private static final String[] ETAPAS = {"Antes", "Durante", "Depois"};
    private static final int LINHAS_DO_SUMARIO = 30;

    public byte[] visita(Obra obra, VisitaPreviaObra visita) {
        return visita(obra, visita, new EvidenciaVisitaPreviaUseCases.ParaDocumento(List.of(), List.of()), null);
    }

    public byte[] visita(Obra obra, VisitaPreviaObra visita, EvidenciaVisitaPreviaUseCases.ParaDocumento evidencias) {
        return visita(obra, visita, evidencias, null);
    }

    /** Relatório da visita: identificação, parecer, checklist, observações, registro fotográfico e responsável. */
    public byte[] visita(Obra obra, VisitaPreviaObra visita, EvidenciaVisitaPreviaUseCases.ParaDocumento evidencias, String municipio) {
        try (PDDocument documento = new PDDocument()) {
            String emissao = agora();
            Escrita escrita = new Escrita(documento);
            escrita.titulo("Relatório de visita prévia");
            escrita.paragrafo("Obra " + obra.getNumero() + " · " + obra.getTitulo());
            escrita.secao("Identificação");
            List<String[]> campos = new ArrayList<>(identificacao(obra, municipio));
            campos.add(new String[]{"Data da visita", visita.getDataVisita().format(DATA)});
            campos.add(new String[]{"Responsável pela visita", visita.getResponsavel()});
            campos.add(new String[]{"Modelo de checklist", visita.getTituloModelo(), "largo"});
            escrita.grade(campos, 2);

            List<RespostasChecklist.Item> naoConformes = visita.getRespostas().naoConformidades();
            escrita.secao("Parecer da visita");
            if (naoConformes.isEmpty()) {
                escrita.aviso("Nenhuma não conformidade apontada.", List.of("Todos os itens com resposta esperada ficaram conformes."), EXECUTADO, FUNDO_OK);
            } else {
                escrita.aviso(naoConformes.size() == 1 ? "1 não conformidade apontada" : naoConformes.size() + " não conformidades apontadas",
                        naoConformes.stream().map(i -> i.grupo() + " · " + i.enunciado() + (i.enunciado().endsWith("?") ? " " : ": ") + i.resposta()
                                + " (esperado: " + i.opcaoConforme() + ")").toList(),
                        ERRO, FUNDO_ERRO);
            }
            escrita.secao("Checklist da visita");
            escrita.checklist(visita.getRespostas());
            if (visita.getObservacoes() != null) {
                escrita.secao("Observações");
                escrita.quadro(visita.getObservacoes());
            }
            if (!evidencias.fotos().isEmpty()) {
                escrita.garantirFotos(2);
            }
            escrita.secao("Registro fotográfico");
            int totalEvidencias = evidencias.fotos().size() + evidencias.pdfs().size();
            if (totalEvidencias == 0) {
                escrita.paragrafo("Sem evidências anexadas.");
            } else {
                escrita.nota(anexadas(evidencias.fotos().size(), evidencias.pdfs().size()));
                escrita.fotos(evidencias.fotos(), 2);
                if (!evidencias.pdfs().isEmpty()) {
                    escrita.grupo("Documentos em PDF anexados");
                    for (String pdf : evidencias.pdfs()) {
                        escrita.paragrafo("• " + pdf);
                    }
                }
            }
            escrita.secao("Responsabilidade");
            escrita.assinaturas(List.of(new String[]{"Responsável pela visita", visita.getResponsavel()}, new String[]{"Recebido por (planejamento)", ""}));
            escrita.fechar();
            // A revisão acompanha as correções da visita (cada "Corrigir" salva uma versão nova do registro); a data separa
            // as visitas da mesma obra.
            int revisao = revisaoDaVisita(visita);
            String codigo = "VTP-" + codigo(obra) + "-" + visita.getDataVisita().format(DATA_CODIGO) + "-R" + String.format("%02d", revisao);
            folhear(documento, new Folha("VISITA PRÉVIA · " + revisao(revisao).toUpperCase(PT_BR), "Obra " + obra.getNumero() + " · " + obra.getTitulo(), codigo, emissao), 0);
            return salvar(documento);
        } catch (IOException e) {
            throw new UncheckedIOException("Falha ao gerar o PDF da visita prévia", e);
        }
    }

    public byte[] asBuilt(DadosAsBuilt dados) {
        try (PDDocument documento = Loader.loadPDF(dados.projeto())) {
            String emissao = agora();
            String revisao = revisao(dados.numeroVersao());
            String codigo = "ASB-" + codigo(dados.obra()) + "-R" + String.format("%02d", dados.numeroVersao());
            marcarFolhas(documento, dados, new String[]{"AS BUILT · " + revisao.toUpperCase(PT_BR) + " · " + emissao.substring(0, 10),
                    "Obra " + dados.obra().getNumero() + " · " + codigo});
            int folhasDoProjeto = documento.getNumberOfPages();
            Map<UUID, PontoPlanejamento> pontos = dados.pontos().stream().collect(Collectors.toMap(PontoPlanejamento::getId, Function.identity()));
            Escrita escrita = new Escrita(documento);
            List<EntradaSumario> entradas = new ArrayList<>();
            if (folhasDoProjeto > 0) {
                entradas.add(new EntradaSumario("1  Folhas do projeto com o executado", folhasDoProjeto == 1 ? "1 folha" : folhasDoProjeto + " folhas", 1));
                escrita.numerarDepoisDe(1);
            }
            List<FichaAsBuilt> fichas = dados.fichas().stream()
                    .filter(f -> pontos.containsKey(f.getIdPonto()))
                    .sorted(Comparator.comparing((FichaAsBuilt f) -> pontos.get(f.getIdPonto()).getPagina()).thenComparing(f -> pontos.get(f.getIdPonto()).getNumero()))
                    .toList();
            escrita.secao("Fichas e registro fotográfico por ponto");
            entradas.add(new EntradaSumario(escrita.ultimaSecao() + "  Fichas e registro fotográfico por ponto", fichas.size() == 1 ? "1 ponto" : fichas.size() + " pontos",
                    escrita.paginaUltimaSecao()));
            int fotos = 0;
            boolean primeiro = true;
            for (FichaAsBuilt f : fichas) {
                PontoPlanejamento ponto = pontos.get(f.getIdPonto());
                List<Foto> doPonto = dados.fotos().getOrDefault(f.getIdPonto(), List.of());
                fotos += doPonto.size();
                if (!primeiro) {
                    escrita.quebrarPagina();
                }
                primeiro = false;
                int pagina = ficha(escrita, ponto, f, doPonto);
                entradas.add(new EntradaSumario("   Ponto " + ponto.getNumero() + " · folha " + ponto.getPagina(), quantas(doPonto.size()), pagina));
            }
            if (equipamentos(escrita, dados.equipamentos(), pontos)) {
                entradas.add(new EntradaSumario(escrita.ultimaSecao() + "  Equipamentos instalados", null, escrita.paginaUltimaSecao()));
            }
            escrita.secao("Responsabilidade técnica");
            entradas.add(new EntradaSumario(escrita.ultimaSecao() + "  Responsabilidade técnica", null, escrita.paginaUltimaSecao()));
            escrita.nota("Declaramos que o executado em campo corresponde ao registrado neste documento e nas folhas do projeto marcadas.");
            escrita.assinaturas(List.of(new String[]{"Responsável técnico", "", "registro"}, new String[]{"Fiscalização", ""}));
            escrita.fechar();

            // Capa e sumário entram na frente; as páginas do sumário já contam com elas.
            int paginasDoSumario = paginasDoSumario(entradas.size());
            PDPage capa = new PDPage(PDRectangle.A4);
            documento.getPages().insertBefore(capa, documento.getPage(0));
            List<PDPage> sumario = new ArrayList<>();
            PDPage anterior = capa;
            for (int i = 0; i < paginasDoSumario; i++) {
                PDPage pagina = new PDPage(PDRectangle.A4);
                documento.getPages().insertAfter(pagina, anterior);
                sumario.add(pagina);
                anterior = pagina;
            }
            int deslocamento = 1 + paginasDoSumario;
            capa(documento, capa, new Capa("AS BUILT", "Obra " + dados.obra().getNumero(), dados.obra().getTitulo(),
                    identificacao(dados.obra(), dados.municipio()),
                    List.of(new String[]{String.valueOf(dados.pontosExecutados().size()), "Pontos executados"},
                            new String[]{String.valueOf(fichas.size()), "Fichas As Built"},
                            new String[]{String.valueOf(fotos), "Fotos"},
                            new String[]{String.valueOf(folhasDoProjeto), "Folhas do projeto"}),
                    new String[]{String.format("%02d", dados.numeroVersao()), emissao.substring(0, 10),
                            dados.numeroVersao() == 1 ? "Emissão inicial" : "Revisão do As Built (versão " + dados.numeroVersao() + ")", "Sistema"},
                    List.of(), codigo));
            sumario(documento, sumario, entradas.stream().map(e -> new EntradaSumario(e.titulo(), e.detalhe(), e.pagina() + deslocamento)).toList());
            folhear(documento, new Folha("AS BUILT · " + revisao.toUpperCase(PT_BR), "Obra " + dados.obra().getNumero() + " · " + dados.obra().getTitulo(), codigo, emissao), 1);
            return salvar(documento);
        } catch (IOException e) {
            throw new UncheckedIOException("Falha ao gerar o PDF do As Built", e);
        }
    }

    /**
     * Book fotográfico da obra: capa com o resumo, sumário e, a partir daí, uma seção por ponto (começando em página nova),
     * com os dados do ponto, as fotos agrupadas por etapa e a ficha As Built.
     */
    public byte[] book(DadosBook dados) {
        try (PDDocument documento = new PDDocument()) {
            String emissao = agora();
            String revisao = revisao(dados.numeroVersao());
            String codigo = "BKF-" + codigo(dados.obra()) + "-R" + String.format("%02d", dados.numeroVersao());
            PDPage capa = new PDPage(PDRectangle.A4);
            documento.addPage(capa);
            List<PDPage> sumario = new ArrayList<>();
            for (int i = 0; i < paginasDoSumario(Math.max(1, dados.pontos().size() + 1)); i++) {
                PDPage pagina = new PDPage(PDRectangle.A4);
                documento.addPage(pagina);
                sumario.add(pagina);
            }
            Escrita escrita = new Escrita(documento);
            List<EntradaSumario> entradas = new ArrayList<>();
            int fotos = 0;
            if (dados.pontos().isEmpty()) {
                escrita.paragrafo("Nenhum ponto com foto ou execução nesta obra.");
            }
            for (int i = 0; i < dados.pontos().size(); i++) {
                PontoBook ponto = dados.pontos().get(i);
                // Ponto com foto abre folha nova; o que não tem foto segue na mesma folha (não gasta uma página só com o aviso).
                if (i > 0 && !ponto.fotos().isEmpty()) {
                    escrita.quebrarPagina();
                }
                String detalhe = quantas(ponto.fotos().size()) + (ponto.ficha() != null ? " · ficha: " + ponto.ficha().toLowerCase(PT_BR) : "");
                fotos += ponto.fotos().size();
                int pagina = pontoDoBook(escrita, ponto);
                entradas.add(new EntradaSumario("Ponto " + ponto.numero() + " · folha " + ponto.pagina(), detalhe, pagina));
            }
            escrita.secao("Aprovação", false);
            entradas.add(new EntradaSumario("Aprovação", null, escrita.paginaUltimaSecao()));
            escrita.assinaturas(List.of(new String[]{"Elaborado por", dados.geradoPor() != null ? dados.geradoPor() : ""}, new String[]{"Verificado por", ""},
                    new String[]{"Aprovado por", ""}));
            escrita.fechar();
            capa(documento, capa, new Capa("BOOK FOTOGRÁFICO DE OBRA", "Obra " + dados.obra().getNumero(), dados.obra().getTitulo(),
                    identificacao(dados.obra(), dados.municipio()),
                    List.of(new String[]{String.valueOf(dados.pontos().size()), "Pontos no book"},
                            new String[]{String.valueOf(fotos), "Fotos"},
                            new String[]{dados.fichasCompletas() + "/" + dados.pontosExecutados(), "Fichas completas"}),
                    new String[]{String.format("%02d", dados.numeroVersao()), emissao.substring(0, 10),
                            dados.numeroVersao() == 1 ? "Emissão inicial" : "Revisão do book (versão " + dados.numeroVersao() + ")",
                            dados.geradoPor() != null ? dados.geradoPor() : "Sistema"},
                    List.of(), codigo));
            sumario(documento, sumario, entradas);
            folhear(documento, new Folha("BOOK FOTOGRÁFICO · " + revisao.toUpperCase(PT_BR), "Obra " + dados.obra().getNumero() + " · " + dados.obra().getTitulo(), codigo, emissao), 1);
            return salvar(documento);
        } catch (IOException e) {
            throw new UncheckedIOException("Falha ao gerar o PDF do Book", e);
        }
    }

    /** Escreve o ponto e devolve a página em que ele começa (para o sumário). */
    private static int pontoDoBook(Escrita escrita, PontoBook ponto) throws IOException {
        escrita.faixa("Ponto " + ponto.numero(), "Folha " + ponto.pagina() + " do projeto");
        int paginaDoPonto = escrita.paginaUltimaSecao();
        List<String[]> dados = new ArrayList<>();
        dados.add(new String[]{"Situação", ponto.executado() ? "Executado" : "Sem execução"});
        dados.add(new String[]{"Ficha As Built", ponto.ficha() != null ? ponto.ficha() : "—"});
        dados.add(new String[]{"Fotos", String.valueOf(ponto.fotos().size())});
        dados.add(new String[]{"Folha do projeto", String.valueOf(ponto.pagina())});
        if (ponto.equipamento() != null) {
            dados.add(new String[]{"Equipamento", ponto.equipamento(), "largo"});
        }
        escrita.grade(dados, 4);
        if (!ponto.fotosFaltando().isEmpty()) {
            escrita.aviso("Atenção: falta foto de " + String.join(", ", ponto.fotosFaltando()) + ".", List.of(), ATENCAO, FUNDO_ATENCAO);
        }
        if (ponto.fotos().isEmpty()) {
            escrita.paragrafo("Nenhuma foto lançada neste ponto.");
        } else {
            // Antes, durante e depois lado a lado, na ordem da execução; sem etapa por último.
            List<Foto> ordenadas = new ArrayList<>();
            List<String> resumo = new ArrayList<>();
            for (String etapa : ETAPAS) {
                List<Foto> daEtapa = ponto.fotos().stream().filter(f -> etapa.equals(f.etapa())).toList();
                ordenadas.addAll(daEtapa);
                if (!daEtapa.isEmpty()) {
                    resumo.add(etapa + " da execução (" + daEtapa.size() + ")");
                }
            }
            List<Foto> semEtapa = ponto.fotos().stream().filter(f -> f.etapa() == null).toList();
            ordenadas.addAll(semEtapa);
            if (!semEtapa.isEmpty() && semEtapa.size() < ponto.fotos().size()) {
                resumo.add("Sem etapa informada (" + semEtapa.size() + ")");
            }
            escrita.garantirFotos(3);
            escrita.grupo("Registro fotográfico");
            if (!resumo.isEmpty()) {
                escrita.nota(String.join("  ·  ", resumo));
            }
            escrita.fotos(ordenadas, 3);
        }
        if (ponto.respostas() != null && !ponto.respostas().itens().isEmpty()) {
            escrita.grupo("Ficha As Built");
            escrita.checklist(ponto.respostas());
        }
        return paginaDoPonto;
    }

    /** "3 fotos e 1 documento anexados." */
    private static String anexadas(int fotos, int documentos) {
        List<String> partes = new ArrayList<>();
        if (fotos > 0) {
            partes.add(quantas(fotos));
        }
        if (documentos > 0) {
            partes.add(documentos == 1 ? "1 documento" : documentos + " documentos");
        }
        boolean um = fotos + documentos == 1;
        return String.join(" e ", partes) + (um ? (fotos == 1 ? " anexada." : " anexado.") : " anexados.");
    }

    private static String quantas(int fotos) {
        return fotos == 1 ? "1 foto" : fotos + " fotos";
    }

    private static int paginasDoSumario(int entradas) {
        return Math.max(1, (entradas + LINHAS_DO_SUMARIO - 1) / LINHAS_DO_SUMARIO);
    }

    /** Rev. 01 na primeira gravação; cada correção da visita soma uma. */
    static int revisaoDaVisita(VisitaPreviaObra visita) {
        return visita.getVersao() == null ? 1 : (int) (visita.getVersao() + 1);
    }

    private static String agora() {
        return OffsetDateTime.now(ApontamentoExecucaoUseCases.FUSO).format(DATA_HORA);
    }

    private static String revisao(int versao) {
        return "Rev. " + String.format("%02d", versao);
    }

    private static String codigo(Obra obra) {
        return obra.getNumero().replaceAll("[^A-Za-z0-9]", "");
    }

    /** Campos de identificação da obra que existirem: obra, nota, município, endereço e coordenadas. */
    private static List<String[]> identificacao(Obra obra, String municipio) {
        List<String[]> campos = new ArrayList<>();
        campos.add(new String[]{"Obra", obra.getNumero()});
        campos.add(new String[]{"Nota", vazio(obra.getNotaObra())});
        campos.add(new String[]{"Município", vazio(municipio)});
        campos.add(new String[]{"Coordenadas", obra.getLatitude() != null && obra.getLongitude() != null
                ? GeracaoAsBuiltService.coordenadas(obra.getLatitude(), obra.getLongitude()) : "—"});
        campos.add(new String[]{"Descrição", obra.getTitulo(), "largo"});
        if (obra.getEndereco() != null && !obra.getEndereco().isBlank()) {
            campos.add(new String[]{"Endereço", obra.getEndereco(), "largo"});
        }
        return campos;
    }

    private static String vazio(String valor) {
        return valor == null || valor.isBlank() ? "—" : valor;
    }

    /** Capa técnica: tipo, título, identificação em grade, indicadores, controle de emissão e campos de aprovação. */
    private static void capa(PDDocument documento, PDPage pagina, Capa c) throws IOException {
        PDType1Font normal = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        PDType1Font negrito = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        float largura = LARGURA_A4 - 2 * MARGEM;
        try (PDPageContentStream cs = new PDPageContentStream(documento, pagina, PDPageContentStream.AppendMode.APPEND, true, true)) {
            // Moldura da folha e faixa do título.
            moldura(cs, MARGEM - 14, 34, LARGURA_A4 - 2 * (MARGEM - 14), ALTURA_A4 - 34 - 30, BORDA, 0.8f);
            cs.setNonStrokingColor(ACENTO);
            cs.addRect(MARGEM - 14, ALTURA_A4 - 34, LARGURA_A4 - 2 * (MARGEM - 14), 4);
            cs.fill();
            float y = ALTURA_A4 - 84;
            texto(cs, negrito, 10, ACENTO, MARGEM, y, c.tipo());
            y -= 38;
            for (String linha : Escrita.quebrar(seguro(negrito, c.titulo()), negrito, 28, largura)) {
                texto(cs, negrito, 28, TEXTO, MARGEM, y, linha);
                y -= 32;
            }
            if (c.subtitulo() != null) {
                int n = 0;
                for (String linha : Escrita.quebrar(seguro(normal, c.subtitulo()), normal, 12, largura)) {
                    if (n++ == 3) {
                        break;
                    }
                    texto(cs, normal, 12, SUAVE, MARGEM, y, linha);
                    y -= 16;
                }
            }
            y -= 18;
            rotuloDeBloco(cs, negrito, MARGEM, y, "IDENTIFICAÇÃO");
            y -= 8;
            y -= grade(cs, normal, negrito, MARGEM, y, largura, c.identificacao(), 2);
            y -= 22;
            rotuloDeBloco(cs, negrito, MARGEM, y, "RESUMO");
            y -= 8;
            y -= indicadores(cs, normal, negrito, MARGEM, y, largura, c.indicadores());
            y -= 22;
            rotuloDeBloco(cs, negrito, MARGEM, y, "CONTROLE DE EMISSÃO");
            y -= 8;
            float[] colunas = {44, 76, largura - 44 - 76 - 120, 120};
            String[] cabecalho = {"Rev.", "Data", "Descrição", "Emitido por"};
            float x = MARGEM;
            cs.setNonStrokingColor(FUNDO_FORTE);
            cs.addRect(MARGEM, y - 16, largura, 16);
            cs.fill();
            for (int i = 0; i < colunas.length; i++) {
                texto(cs, negrito, 7.5f, TEXTO, x + 5, y - 11, cabecalho[i]);
                texto(cs, normal, 8.5f, TEXTO, x + 5, y - 29, cortar(seguro(normal, c.emissao()[i]), normal, 8.5f, colunas[i] - 10));
                moldura(cs, x, y - 36, colunas[i], 36, BORDA, 0.5f);
                x += colunas[i];
            }
            cs.setStrokingColor(BORDA);
            cs.moveTo(MARGEM, y - 16);
            cs.lineTo(MARGEM + largura, y - 16);
            cs.stroke();

            // Aprovação no pé da capa, quando o documento a pede ali (os relatórios trazem a aprovação na última folha).
            if (!c.aprovacao().isEmpty()) {
                float alturaAprovacao = 74;
                float base = 70;
                rotuloDeBloco(cs, negrito, MARGEM, base + alturaAprovacao + 14, "APROVAÇÃO");
                caixasDeAssinatura(cs, normal, negrito, MARGEM, base + alturaAprovacao, largura, alturaAprovacao, c.aprovacao());
            }
            texto(cs, normal, 7, SUAVE, MARGEM, 46, "Documento emitido pelo sistema a partir dos registros de campo e do escritório. Vale a última revisão emitida.");
            String cod = seguro(negrito, c.codigo());
            texto(cs, negrito, 7.5f, TEXTO, LARGURA_A4 - MARGEM - negrito.getStringWidth(cod) / 1000f * 7.5f, 46, cod);
        }
    }

    private static void rotuloDeBloco(PDPageContentStream cs, PDType1Font negrito, float x, float y, String texto) throws IOException {
        texto(cs, negrito, 7.5f, SUAVE, x, y, texto);
    }

    /**
     * Grade de campos com bordas: rótulo pequeno em cima, valor embaixo. Campo com terceiro elemento ocupa a linha inteira.
     * Devolve a altura usada.
     */
    private static float grade(PDPageContentStream cs, PDType1Font normal, PDType1Font negrito, float x, float topo, float largura,
                               List<String[]> campos, int colunas) throws IOException {
        float altura = 30;
        float coluna = largura / colunas;
        float linha = topo;
        int col = 0;
        for (String[] campo : campos) {
            boolean largo = campo.length > 2;
            if (largo && col > 0) {
                completar(cs, x, linha, coluna, altura, col, colunas);
                col = 0;
                linha -= altura;
            }
            float w = largo ? largura : coluna;
            float cx = x + col * coluna;
            texto(cs, normal, 6.5f, SUAVE, cx + 6, linha - 10, campo[0].toUpperCase(PT_BR));
            texto(cs, negrito, 9.5f, TEXTO, cx + 6, linha - 23, cortar(seguro(negrito, campo[1] != null ? campo[1] : "—"), negrito, 9.5f, w - 12));
            moldura(cs, cx, linha - altura, w, altura, BORDA, 0.5f);
            if (largo || col == colunas - 1) {
                col = 0;
                linha -= altura;
            } else {
                col++;
            }
        }
        if (col > 0) {
            completar(cs, x, linha, coluna, altura, col, colunas);
            linha -= altura;
        }
        return topo - linha;
    }

    private static void completar(PDPageContentStream cs, float x, float linha, float coluna, float altura, int de, int colunas) throws IOException {
        for (int c = de; c < colunas; c++) {
            moldura(cs, x + c * coluna, linha - altura, coluna, altura, BORDA, 0.5f);
        }
    }

    /** Caixas de indicador (número grande e rótulo), lado a lado. Devolve a altura usada. */
    private static float indicadores(PDPageContentStream cs, PDType1Font normal, PDType1Font negrito, float x, float topo, float largura,
                                     List<String[]> indicadores) throws IOException {
        float altura = 52;
        float vao = 8;
        float w = (largura - vao * (indicadores.size() - 1)) / indicadores.size();
        for (int i = 0; i < indicadores.size(); i++) {
            float cx = x + i * (w + vao);
            cs.setNonStrokingColor(FUNDO);
            cs.addRect(cx, topo - altura, w, altura);
            cs.fill();
            cs.setNonStrokingColor(ACENTO);
            cs.addRect(cx, topo - altura, 2.5f, altura);
            cs.fill();
            texto(cs, negrito, 20, TEXTO, cx + 12, topo - 28, indicadores.get(i)[0]);
            texto(cs, normal, 7.5f, SUAVE, cx + 12, topo - 43, indicadores.get(i)[1]);
        }
        return altura;
    }

    /** Campos de aprovação: papel, nome (quando conhecido), linha de assinatura e data. */
    private static void caixasDeAssinatura(PDPageContentStream cs, PDType1Font normal, PDType1Font negrito, float x, float topo, float largura,
                                           float altura, List<String[]> papeis) throws IOException {
        float w = largura / papeis.size();
        for (int i = 0; i < papeis.size(); i++) {
            float cx = x + i * w;
            moldura(cs, cx, topo - altura, w, altura, BORDA, 0.5f);
            texto(cs, normal, 6.5f, SUAVE, cx + 6, topo - 10, papeis.get(i)[0].toUpperCase(PT_BR));
            String nome = papeis.get(i)[1];
            if (nome != null && !nome.isBlank()) {
                texto(cs, negrito, 8.5f, TEXTO, cx + 6, topo - 22, cortar(seguro(negrito, nome), negrito, 8.5f, w - 12));
            }
            cs.setStrokingColor(SUAVE);
            cs.setLineWidth(0.5f);
            cs.moveTo(cx + 6, topo - altura + 24);
            cs.lineTo(cx + w - 6, topo - altura + 24);
            cs.stroke();
            texto(cs, normal, 6.5f, SUAVE, cx + 6, topo - altura + 15, "Assinatura");
            texto(cs, normal, 6.5f, SUAVE, cx + 6, topo - altura + 5, "Data: ____/____/________");
            if (papeis.get(i).length > 2) {
                texto(cs, normal, 6.5f, SUAVE, cx + 6, topo - 34, "Registro (CREA/CFT): ______________   ART/TRT: ______________");
            }
        }
    }

    private static void moldura(PDPageContentStream cs, float x, float y, float w, float h, Color cor, float espessura) throws IOException {
        cs.setStrokingColor(cor);
        cs.setLineWidth(espessura);
        cs.addRect(x, y, w, h);
        cs.stroke();
    }

    /** Sumário com o título de cada seção, um detalhe e a página, em quantas páginas forem reservadas. */
    private static void sumario(PDDocument documento, List<PDPage> paginas, List<EntradaSumario> entradas) throws IOException {
        PDType1Font normal = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        PDType1Font negrito = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        float direita = LARGURA_A4 - MARGEM;
        for (int p = 0; p < paginas.size(); p++) {
            try (PDPageContentStream cs = new PDPageContentStream(documento, paginas.get(p), PDPageContentStream.AppendMode.APPEND, true, true)) {
                float y = ALTURA_A4 - 104;
                texto(cs, negrito, 15, TEXTO, MARGEM, y, p == 0 ? "Sumário" : "Sumário (continuação)");
                y -= 10;
                cs.setStrokingColor(TEXTO);
                cs.setLineWidth(0.8f);
                cs.moveTo(MARGEM, y);
                cs.lineTo(direita, y);
                cs.stroke();
                y -= 22;
                int de = Math.min(p * LINHAS_DO_SUMARIO, entradas.size());
                int ate = Math.min((p + 1) * LINHAS_DO_SUMARIO, entradas.size());
                for (EntradaSumario entrada : entradas.subList(de, ate)) {
                    boolean sub = entrada.titulo().startsWith(" ");
                    PDType1Font fonte = sub ? normal : negrito;
                    float x = sub ? MARGEM + 14 : MARGEM;
                    String titulo = seguro(fonte, entrada.titulo().strip());
                    String numero = String.valueOf(entrada.pagina());
                    float largoNumero = negrito.getStringWidth(numero) / 1000f * 9.5f;
                    texto(cs, fonte, 9.5f, TEXTO, x, y, titulo);
                    float fimDoTitulo = x + fonte.getStringWidth(titulo) / 1000f * 9.5f;
                    float fimDoPontilhado = direita - largoNumero - 8;
                    if (entrada.detalhe() != null) {
                        String detalhe = seguro(normal, entrada.detalhe());
                        float largoDetalhe = normal.getStringWidth(detalhe) / 1000f * 8.5f;
                        float inicioDoDetalhe = direita - largoNumero - 16 - largoDetalhe;
                        texto(cs, normal, 8.5f, SUAVE, inicioDoDetalhe, y, detalhe);
                        fimDoPontilhado = inicioDoDetalhe - 6;
                    }
                    if (fimDoPontilhado - fimDoTitulo > 12) {
                        cs.setStrokingColor(BORDA);
                        cs.setLineWidth(0.6f);
                        cs.setLineDashPattern(new float[]{1, 2.5f}, 0);
                        cs.moveTo(fimDoTitulo + 6, y + 1);
                        cs.lineTo(fimDoPontilhado, y + 1);
                        cs.stroke();
                        cs.setLineDashPattern(new float[]{}, 0);
                    }
                    texto(cs, negrito, 9.5f, TEXTO, direita - largoNumero, y, numero);
                    y -= 20;
                }
            }
        }
    }

    /**
     * Cabeçalho e rodapé das folhas A4 a partir de {@code primeira} (a capa tem os seus): tipo, obra, código e emissão em
     * cima; a paginação embaixo. As folhas do projeto ficam como estão (têm a legenda própria).
     */
    private static void folhear(PDDocument documento, Folha folha, int primeira) throws IOException {
        PDType1Font normal = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        PDType1Font negrito = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        int total = documento.getNumberOfPages();
        float largura = LARGURA_A4 - 2 * MARGEM;
        float[] colunas = {largura - 150 - 92, 150, 92};
        String[][] celulas = {{folha.tipo(), folha.obra()}, {"CÓDIGO", folha.codigo()}, {"EMISSÃO", folha.emissao()}};
        for (int i = primeira; i < total; i++) {
            PDPage pagina = documento.getPage(i);
            PDRectangle caixa = pagina.getMediaBox();
            boolean a4 = Math.abs(caixa.getWidth() - LARGURA_A4) < 1 && Math.abs(caixa.getHeight() - ALTURA_A4) < 1;
            if (!a4 || pagina.getRotation() != 0) {
                continue;
            }
            try (PDPageContentStream cs = new PDPageContentStream(documento, pagina, PDPageContentStream.AppendMode.APPEND, true, true)) {
                float topo = ALTURA_A4 - 28;
                float altura = 32;
                float x = MARGEM;
                cs.setNonStrokingColor(ACENTO);
                cs.addRect(MARGEM, topo, largura, 2);
                cs.fill();
                for (int c = 0; c < colunas.length; c++) {
                    Color corRotulo = c == 0 ? ACENTO : SUAVE;
                    texto(cs, negrito, 6.5f, corRotulo, x + 6, topo - 11, cortar(seguro(negrito, celulas[c][0]), negrito, 6.5f, colunas[c] - 16));
                    texto(cs, negrito, 8.5f, TEXTO, x + 6, topo - 25, cortarNaPalavra(seguro(negrito, celulas[c][1]), negrito, 8.5f, colunas[c] - 12));
                    moldura(cs, x, topo - altura, colunas[c], altura, BORDA, 0.5f);
                    x += colunas[c];
                }
                cs.setStrokingColor(DIVISOR);
                cs.setLineWidth(0.5f);
                cs.moveTo(MARGEM, 38);
                cs.lineTo(MARGEM + largura, 38);
                cs.stroke();
                texto(cs, normal, 7, SUAVE, MARGEM, 26, "Emitido pelo sistema a partir dos registros de campo e do escritório · " + folha.codigo());
                String numero = "Página " + (i + 1) + " de " + total;
                texto(cs, negrito, 7.5f, TEXTO, LARGURA_A4 - MARGEM - negrito.getStringWidth(numero) / 1000f * 7.5f, 26, numero);
            }
        }
    }

    private static void texto(PDPageContentStream cs, PDType1Font fonte, float tamanho, Color cor, float x, float y, String texto) throws IOException {
        cs.beginText();
        cs.setFont(fonte, tamanho);
        cs.setNonStrokingColor(cor);
        cs.newLineAtOffset(x, y);
        cs.showText(seguro(fonte, texto));
        cs.endText();
    }

    /** Relatório de medição detalhado: resumo, comparativos, faturado a conferir, medições, fotos por ponto e assinaturas. */
    byte[] relatorioMedicao(RelatorioMedicaoDetalhado r, Map<String, List<Foto>> fotos) {
        try (PDDocument documento = new PDDocument()) {
            String emissao = agora();
            Escrita escrita = new Escrita(documento);
            escrita.titulo("Relatório de medição detalhado");
            escrita.paragrafo("Obra " + r.obra().getNumero() + " · " + r.obra().getTitulo());
            List<String[]> campos = new ArrayList<>();
            campos.add(new String[]{"Obra", r.obra().getNumero()});
            campos.add(new String[]{"Data de corte", r.dataCorte().format(DATA)});
            campos.add(new String[]{"Município", vazio(r.municipio())});
            campos.add(new String[]{"Fiscal", vazio(r.fiscal())});
            campos.add(new String[]{"Responsável", vazio(r.responsavel()), "largo"});
            escrita.grade(campos, 2);

            escrita.secao("Resumo");
            escrita.tabela(new String[]{"Indicador", "Valor (R$)"}, new float[]{380, 119}, new boolean[]{false, true}, List.of(
                    new String[]{"Orçado de mão de obra", dinheiro(r.orcadoMaoDeObra())},
                    new String[]{"Orçado de materiais", dinheiro(r.orcadoMateriais())},
                    new String[]{"Executado até a data de corte", dinheiro(r.executado())},
                    new String[]{"Faturado até a data de corte", dinheiro(r.faturadoTotal())},
                    new String[]{"Executado a faturar", dinheiro(r.aFaturar())},
                    new String[]{"Saldo do orçamento de mão de obra", dinheiro(r.saldoOrcado())},
                    new String[]{"Medido no sistema", dinheiro(r.medidoNoSistema())}), null);

            escrita.secao("Mão de obra");
            if (r.maoDeObra().isEmpty()) {
                escrita.paragrafo("Nenhum serviço orçado, planejado ou faturado.");
            } else {
                escrita.tabela(new String[]{"Código", "Serviço", "Op.", "Orçado", "Orçado R$", "Exec.", "Exec. R$", "Faturado", "Fat. R$", "A faturar R$"},
                        new float[]{44, 120, 26, 36, 50, 38, 50, 38, 50, 47},
                        new boolean[]{false, false, false, true, true, true, true, true, true, true},
                        r.maoDeObra().stream().map(l -> new String[]{l.codigo(), marcar(l), operacaoCurta(l.operacao()),
                                quantidade(l.orcadoQuantidade()), dinheiro(l.orcadoValor()), quantidade(l.executadoQuantidade()),
                                dinheiro(l.executadoValor()), quantidade(l.faturadoQuantidade()), dinheiro(l.faturadoValor()), dinheiro(l.aFaturar())}).toList(),
                        new String[]{"Total", "", "", "", dinheiro(r.orcadoMaoDeObra()), "", dinheiro(r.executado()), "", dinheiro(r.faturadoTotal()),
                                dinheiro(r.aFaturar())});
                if (r.maoDeObra().stream().anyMatch(RelatorioMedicaoDetalhado.Linha::acimaDoOrcado)) {
                    escrita.nota("* Executado acima do orçado ou fora do orçamento.");
                }
            }

            escrita.secao("Materiais");
            if (r.materiais().isEmpty()) {
                escrita.paragrafo("Nenhum material orçado ou planejado.");
            } else {
                escrita.tabela(new String[]{"Código", "Material", "Op.", "Un.", "Orçado", "Orçado R$", "Planejado", "Aplicado"},
                        new float[]{50, 190, 30, 30, 45, 60, 47, 47},
                        new boolean[]{false, false, false, false, true, true, true, true},
                        r.materiais().stream().map(l -> new String[]{l.codigo(), marcar(l), operacaoCurta(l.operacao()), texto(l.unidade()),
                                quantidade(l.orcadoQuantidade()), dinheiro(l.orcadoValor()), quantidade(l.planejadoQuantidade()),
                                quantidade(l.executadoQuantidade())}).toList(),
                        new String[]{"Total", "", "", "", "", dinheiro(r.orcadoMateriais()), "", ""});
            }

            if (!r.paraConferir().isEmpty()) {
                escrita.secao("Faturado para conferir");
                escrita.paragrafo("Lançamentos não aprovados ficam fora do faturado; créditos entram subtraindo.");
                escrita.tabela(new String[]{"Data", "Código", "Descrição", "Qtd.", "Valor R$", "Situação", "D/C"},
                        new float[]{50, 50, 194, 45, 70, 50, 40},
                        new boolean[]{false, false, false, true, true, false, false},
                        r.paraConferir().stream().map(l -> new String[]{l.data().format(DATA), l.codigo(), texto(l.descricao()),
                                quantidade(l.quantidade()), dinheiro(l.valorTotal()), l.situacao(), l.credito() ? "C" : "D"}).toList(), null);
            }
            if (!r.medicoes().isEmpty()) {
                escrita.secao("Medições no sistema");
                escrita.tabela(new String[]{"Medição", "Tipo", "Competência", "Situação", "Valor R$", "Gerada em"},
                        new float[]{60, 70, 70, 80, 99, 120},
                        new boolean[]{false, false, false, false, true, false},
                        r.medicoes().stream().map(m -> new String[]{"#" + m.numero(), m.tipo() != null && m.tipo().name().equals("CICLO") ? "Ciclo" : "Parcial",
                                m.competencia() != null ? m.competencia().format(DateTimeFormatter.ofPattern("MM/yyyy")) : "",
                                m.status().name().equals("GERADA") ? "Gerada" : "Estornada", dinheiro(m.valorTotal()),
                                m.dataCriacao() != null ? m.dataCriacao().atZoneSameInstant(ApontamentoExecucaoUseCases.FUSO).format(DATA_HORA) : ""}).toList(), null);
            }

            if (!fotos.isEmpty()) {
                // Título e primeira linha de fotos ficam na mesma página.
                float primeiraLinha = Escrita.ALTURA_FOTO + Escrita.ALTURA_LEGENDA;
                escrita.garantir(primeiraLinha + 90);
                escrita.secao("Registro fotográfico");
                for (Map.Entry<String, List<Foto>> ponto : fotos.entrySet()) {
                    escrita.garantir(primeiraLinha + 40);
                    escrita.grupo("Ponto " + ponto.getKey());
                    escrita.fotos(ponto.getValue(), 2);
                }
            }

            escrita.secao("Aprovação");
            escrita.assinaturas(List.of(new String[]{"Fiscal", texto(r.fiscal())}, new String[]{"Responsável", texto(r.responsavel())}));
            escrita.fechar();
            folhear(documento, new Folha("MEDIÇÃO DETALHADA", "Obra " + r.obra().getNumero() + " · " + r.obra().getTitulo(),
                    "MED-" + codigo(r.obra()) + "-" + r.dataCorte().format(DATA_CODIGO), emissao), 0);
            return salvar(documento);
        } catch (IOException e) {
            throw new UncheckedIOException("Falha ao gerar o PDF do relatório de medição", e);
        }
    }

    private static String marcar(RelatorioMedicaoDetalhado.Linha linha) {
        String descricao = texto(linha.descricao());
        return linha.acimaDoOrcado() ? "* " + descricao : descricao;
    }

    private static String operacaoCurta(OperacaoItemKit operacao) {
        return operacao == null ? "" : operacao == OperacaoItemKit.INSTALAR ? "Inst." : "Ret.";
    }

    private static String texto(String valor) {
        return valor == null ? "" : valor;
    }

    private static String dinheiro(BigDecimal valor) {
        if (valor == null) {
            return "";
        }
        DecimalFormat formato = new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(PT_BR));
        return formato.format(valor);
    }

    private static String quantidade(BigDecimal valor) {
        if (valor == null) {
            return "";
        }
        DecimalFormat formato = new DecimalFormat("#,##0.####", DecimalFormatSymbols.getInstance(PT_BR));
        return formato.format(valor);
    }

    private static int ficha(Escrita escrita, PontoPlanejamento ponto, FichaAsBuilt ficha, List<Foto> fotos) {
        try {
            escrita.faixa("Ponto " + ponto.getNumero(), "Folha " + ponto.getPagina() + " do projeto");
            int pagina = escrita.paginaUltimaSecao();
            escrita.grade(List.of(new String[]{"Situação", "Executado"}, new String[]{"Ficha As Built", ficha.isCompleta() ? "Completa" : "Incompleta"},
                    new String[]{"Fotos", String.valueOf(fotos.size())}, new String[]{"Folha do projeto", String.valueOf(ponto.getPagina())}), 4);
            escrita.grupo("Ficha As Built");
            escrita.checklist(ficha.getRespostas());
            escrita.garantirFotos(3);
            escrita.grupo("Registro fotográfico");
            if (fotos.isEmpty()) {
                escrita.paragrafo("Nenhuma foto lançada neste ponto.");
            }
            escrita.fotos(fotos, 3);
            return pagina;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static boolean equipamentos(Escrita escrita, List<EquipamentoObra> equipamentos, Map<UUID, PontoPlanejamento> pontos) throws IOException {
        List<EquipamentoObra> daObra = equipamentos.stream().filter(e -> pontos.containsKey(e.getIdPonto())).toList();
        if (daObra.isEmpty()) {
            return false;
        }
        escrita.secao("Equipamentos instalados");
        escrita.tabela(new String[]{"Ponto", "Equipamento", "Observação"}, new float[]{60, 200, 239}, new boolean[]{false, false, false},
                daObra.stream().map(e -> new String[]{pontos.get(e.getIdPonto()).getNumero(), tipoDeEquipamento(e), texto(e.getObservacao())}).toList(), null);
        return true;
    }

    private static String tipoDeEquipamento(EquipamentoObra e) {
        return e.getTipo() == EquipamentoObra.Tipo.RELIGADOR
                ? (e.isTrafoAuxiliar() ? "Religador com trafo auxiliar" : "Religador sem trafo auxiliar") : "Regulador";
    }

    /** Religador (com ou sem trafo auxiliar) ou regulador, por extenso. */
    public static String descreverEquipamento(EquipamentoObra e) {
        String tipo = tipoDeEquipamento(e);
        return e.getObservacao() != null ? tipo + " · " + e.getObservacao() : tipo;
    }

    private static String resposta(RespostasChecklist.Item item) {
        if (item.naoSeAplica() || item.valor() == null) {
            return item.resposta();
        }
        if (item.tipo() == EstruturaChecklist.TipoPergunta.DATA) {
            return LocalDate.parse(item.valor()).format(DATA);
        }
        if (item.tipo() == EstruturaChecklist.TipoPergunta.NUMERO) {
            try {
                return quantidade(new BigDecimal(item.valor()));
            } catch (NumberFormatException e) {
                return item.valor();
            }
        }
        return item.resposta();
    }

    /** Situação do item no checklist: conforme, não conforme, não se aplica, pendente ou só informado. */
    private static String situacao(RespostasChecklist.Item item) {
        if (item.naoSeAplica()) {
            return "N/A";
        }
        if (item.naoConforme()) {
            return "Não conforme";
        }
        if ("Não respondido".equals(item.resposta())) {
            return item.obrigatoria() ? "Pendente" : "—";
        }
        return item.opcaoConforme() != null ? "Conforme" : "Informado";
    }

    private static Color corDaSituacao(String situacao) {
        return switch (situacao) {
            case "Conforme" -> EXECUTADO;
            case "Não conforme" -> ERRO;
            case "Pendente" -> ATENCAO;
            default -> SUAVE;
        };
    }

    /** Fica só com as folhas que têm algo executado, desenha nelas pontos e vãos e carimba a legenda. */
    private static void marcarFolhas(PDDocument documento, DadosAsBuilt dados, String[] carimbo) throws IOException {
        Map<UUID, PontoPlanejamento> pontos = dados.pontos().stream().collect(Collectors.toMap(PontoPlanejamento::getId, Function.identity()));
        List<VaoPlanejamento> vaos = dados.vaos().stream()
                .filter(v -> dados.vaosExecutados().contains(v.getId()) && pontos.containsKey(v.getIdPontoA()) && pontos.containsKey(v.getIdPontoB()))
                .toList();
        Set<Integer> folhas = new HashSet<>();
        dados.pontos().stream().filter(p -> dados.pontosExecutados().contains(p.getId())).forEach(p -> folhas.add(p.getPagina()));
        vaos.forEach(v -> {
            folhas.add(pontos.get(v.getIdPontoA()).getPagina());
            folhas.add(pontos.get(v.getIdPontoB()).getPagina());
        });
        int total = documento.getNumberOfPages();
        List<PDPage> paginas = new ArrayList<>();
        documento.getPages().forEach(paginas::add);
        PDType1Font fonte = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        for (int numero = 1; numero <= total; numero++) {
            if (folhas.contains(numero)) {
                marcarFolha(documento, paginas.get(numero - 1), numero, dados, vaos, pontos, fonte, carimbo);
            } else {
                documento.removePage(paginas.get(numero - 1));
            }
        }
    }

    private static void marcarFolha(PDDocument documento, PDPage pagina, int numero, DadosAsBuilt dados, List<VaoPlanejamento> vaos,
                                    Map<UUID, PontoPlanejamento> pontos, PDType1Font fonte, String[] carimbo) throws IOException {
        PDRectangle caixa = pagina.getCropBox();
        float unidade = Math.max(caixa.getWidth(), caixa.getHeight()) / 220f;
        try (PDPageContentStream cs = new PDPageContentStream(documento, pagina, PDPageContentStream.AppendMode.APPEND, true, true)) {
            cs.setStrokingColor(EXECUTADO);
            cs.setLineWidth(unidade * 0.5f);
            for (VaoPlanejamento vao : vaos) {
                PontoPlanejamento a = pontos.get(vao.getIdPontoA());
                PontoPlanejamento b = pontos.get(vao.getIdPontoB());
                if (a.getPagina() == numero && b.getPagina() == numero) {
                    cs.moveTo(x(caixa, a), y(caixa, a));
                    cs.lineTo(x(caixa, b), y(caixa, b));
                    cs.stroke();
                } else if (a.getPagina() == numero || b.getPagina() == numero) {
                    PontoPlanejamento aqui = a.getPagina() == numero ? a : b;
                    PontoPlanejamento la = aqui == a ? b : a;
                    rotulo(cs, pagina, fonte, unidade, x(caixa, aqui), y(caixa, aqui) - unidade * 3.5f, "Vão até " + la.getNumero() + " (folha " + la.getPagina() + ")");
                }
            }
            for (PontoPlanejamento ponto : dados.pontos()) {
                if (ponto.getPagina() == numero && dados.pontosExecutados().contains(ponto.getId())) {
                    circulo(cs, x(caixa, ponto), y(caixa, ponto), unidade);
                    rotulo(cs, pagina, fonte, unidade, x(caixa, ponto) + unidade * 1.5f, y(caixa, ponto) + unidade * 1.5f, ponto.getNumero());
                }
            }
            legendaDaFolha(cs, pagina, caixa, unidade, carimbo);
        }
    }

    /**
     * Legenda do As Built no canto inferior esquerdo da folha como ela é vista (gira com a rotação): o carimbo da emissão
     * e o significado das marcas.
     */
    private static void legendaDaFolha(PDPageContentStream cs, PDPage pagina, PDRectangle caixa, float unidade, String[] carimbo) throws IOException {
        PDType1Font negrito = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        PDType1Font normal = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        int rotacao = ((pagina.getRotation() % 360) + 360) % 360;
        float cx = rotacao == 90 || rotacao == 180 ? caixa.getUpperRightX() : caixa.getLowerLeftX();
        float cy = rotacao == 180 || rotacao == 270 ? caixa.getUpperRightY() : caixa.getLowerLeftY();
        float tamanho = unidade * 1.7f;
        String titulo = seguro(negrito, carimbo[0]);
        String identificacao = seguro(normal, carimbo[1]);
        float largura = Math.max(Math.max(negrito.getStringWidth(titulo), normal.getStringWidth(identificacao)) / 1000f * tamanho, unidade * 34) + unidade * 4;
        float altura = unidade * 12f;
        cs.saveGraphicsState();
        cs.transform(Matrix.getRotateInstance(Math.toRadians(rotacao), cx, cy));
        cs.transform(Matrix.getTranslateInstance(unidade * 3, unidade * 3));
        cs.setNonStrokingColor(Color.WHITE);
        cs.addRect(0, 0, largura, altura);
        cs.fill();
        cs.setStrokingColor(TEXTO);
        cs.setLineWidth(unidade * 0.15f);
        cs.addRect(0, 0, largura, altura);
        cs.stroke();
        cs.setNonStrokingColor(EXECUTADO);
        cs.addRect(0, altura - unidade * 0.6f, largura, unidade * 0.6f);
        cs.fill();
        texto(cs, negrito, tamanho, TEXTO, unidade * 2, altura - unidade * 3.2f, titulo);
        texto(cs, normal, tamanho, SUAVE, unidade * 2, altura - unidade * 5.6f, identificacao);
        float linha = unidade * 2.2f;
        circulo(cs, unidade * 2.8f, linha + tamanho * 0.35f, unidade * 0.8f);
        texto(cs, normal, tamanho, TEXTO, unidade * 4.4f, linha, "Ponto executado");
        float x = unidade * 4.4f + normal.getStringWidth("Ponto executado") / 1000f * tamanho + unidade * 3;
        cs.setStrokingColor(EXECUTADO);
        cs.setLineWidth(unidade * 0.5f);
        cs.moveTo(x, linha + tamanho * 0.35f);
        cs.lineTo(x + unidade * 4, linha + tamanho * 0.35f);
        cs.stroke();
        texto(cs, normal, tamanho, TEXTO, x + unidade * 5, linha, "Vão executado");
        cs.restoreGraphicsState();
    }

    private static float x(PDRectangle caixa, PontoPlanejamento ponto) {
        return caixa.getLowerLeftX() + ponto.getX().floatValue() * caixa.getWidth();
    }

    private static float y(PDRectangle caixa, PontoPlanejamento ponto) {
        return caixa.getUpperRightY() - ponto.getY().floatValue() * caixa.getHeight();
    }

    private static void circulo(PDPageContentStream cs, float cx, float cy, float r) throws IOException {
        float k = 0.5523f * r;
        cs.setNonStrokingColor(EXECUTADO);
        cs.moveTo(cx + r, cy);
        cs.curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r);
        cs.curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy);
        cs.curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r);
        cs.curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy);
        cs.fill();
    }

    /** O texto gira com a rotação da folha, para ficar de pé em quem lê. */
    private static void rotulo(PDPageContentStream cs, PDPage pagina, PDType1Font fonte, float unidade, float px, float py, String texto) throws IOException {
        String seguro = seguro(fonte, texto);
        float tamanho = unidade * 2.2f;
        float largura = fonte.getStringWidth(seguro) / 1000f * tamanho;
        cs.saveGraphicsState();
        cs.transform(Matrix.getRotateInstance(Math.toRadians(pagina.getRotation()), px, py));
        cs.setNonStrokingColor(Color.WHITE);
        cs.addRect(-tamanho * 0.2f, -tamanho * 0.25f, largura + tamanho * 0.4f, tamanho * 1.2f);
        cs.fill();
        cs.beginText();
        cs.setFont(fonte, tamanho);
        cs.setNonStrokingColor(EXECUTADO);
        cs.newLineAtOffset(0, 0);
        cs.showText(seguro);
        cs.endText();
        cs.restoreGraphicsState();
    }

    private static byte[] salvar(PDDocument documento) throws IOException {
        try (ByteArrayOutputStream saida = new ByteArrayOutputStream()) {
            documento.save(saida);
            return saida.toByteArray();
        }
    }

    /** Troca o que as fontes padrão não têm por um equivalente legível; o resto que não couber vira "?". */
    private static String seguro(PDType1Font fonte, String texto) throws IOException {
        StringBuilder saida = new StringBuilder();
        for (int i = 0; i < texto.length(); i++) {
            char c = texto.charAt(i);
            if (Character.isWhitespace(c)) {
                saida.append(' ');
                continue;
            }
            String trocado = switch (c) {
                case 'Ω' -> i > 0 && Character.isLetterOrDigit(texto.charAt(i - 1)) ? " ohm" : "ohm";
                case '−', '‐', '‑' -> "-";
                case '→' -> "->";
                case '≥' -> ">=";
                case '≤' -> "<=";
                case '×' -> "x";
                default -> null;
            };
            if (trocado != null) {
                saida.append(trocado);
                continue;
            }
            try {
                fonte.encode(String.valueOf(c));
                saida.append(c);
            } catch (IllegalArgumentException e) {
                saida.append('?');
            }
        }
        return saida.toString();
    }

    /** Como {@link #cortar}, mas sem partir palavra: "Obra 7100001 · Extensão de rede BT…". */
    private static String cortarNaPalavra(String texto, PDType1Font fonte, float tamanho, float largura) throws IOException {
        if (fonte.getStringWidth(texto) / 1000f * tamanho <= largura) {
            return texto;
        }
        String corte = texto;
        while (corte.contains(" ") && fonte.getStringWidth(corte + "...") / 1000f * tamanho > largura) {
            corte = corte.substring(0, corte.lastIndexOf(' '));
        }
        corte = corte.replaceAll("[\\s·,-]+$", "");
        return fonte.getStringWidth(corte + "...") / 1000f * tamanho <= largura ? corte + "..." : cortar(texto, fonte, tamanho, largura);
    }

    private static String cortar(String texto, PDType1Font fonte, float tamanho, float largura) throws IOException {
        if (fonte.getStringWidth(texto) / 1000f * tamanho <= largura) {
            return texto;
        }
        String corte = texto;
        while (!corte.isEmpty() && fonte.getStringWidth(corte + "...") / 1000f * tamanho > largura) {
            corte = corte.substring(0, corte.length() - 1);
        }
        return corte.stripTrailing() + "...";
    }

    /** Páginas A4 de texto, com quebra automática. O cabeçalho e o rodapé entram no fim ({@link #folhear}). */
    private static final class Escrita {

        private static final float LARGURA = LARGURA_A4 - 2 * MARGEM;
        private static final float BASE = 52;
        private static final float TOPO = ALTURA_A4 - 80;
        static final float ALTURA_FOTO = 196;
        static final float ALTURA_LEGENDA = 54;
        private static final float VAO_FOTO = 12;
        private static final float FONTE_TABELA = 7.5f;
        private static final float ALTURA_LINHA = 14;

        private final PDDocument documento;
        private final PDType1Font normal = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        private final PDType1Font negrito = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        private PDPageContentStream cs;
        private float y;
        private int paginaDaSecao;
        private int secoes;
        private int fotos;

        Escrita(PDDocument documento) throws IOException {
            this.documento = documento;
            novaPagina();
        }

        void titulo(String texto) throws IOException {
            linhas(texto, negrito, 17, TEXTO, MARGEM, LARGURA, 22);
            y -= 2;
        }

        /** Número (a partir de 1) da página em que se escreve agora. */
        int paginaAtual() {
            return documento.getNumberOfPages();
        }

        /** Página em que começou a última seção ou faixa. */
        int paginaUltimaSecao() {
            return paginaDaSecao;
        }

        void quebrarPagina() throws IOException {
            cs.close();
            novaPagina();
        }

        /** Faixa de destaque que abre a seção de um ponto, com o título e um complemento à direita. */
        void faixa(String titulo, String complemento) throws IOException {
            garantir(80);
            if (y < TOPO) {
                y -= 10;
            }
            paginaDaSecao = paginaAtual();
            float altura = 26;
            cs.setNonStrokingColor(FUNDO_FORTE);
            cs.addRect(MARGEM, y - altura, LARGURA, altura);
            cs.fill();
            cs.setNonStrokingColor(ACENTO);
            cs.addRect(MARGEM, y - altura, 4, altura);
            cs.fill();
            texto(cs, negrito, 12, TEXTO, MARGEM + 14, y - 17, titulo);
            String extra = seguro(normal, complemento);
            float largo = normal.getStringWidth(extra) / 1000f * 8.5f;
            texto(cs, normal, 8.5f, SUAVE, MARGEM + LARGURA - 10 - largo, y - 16.5f, extra);
            y -= altura + 8;
        }

        /** A próxima seção recebe este número + 1 (quando há partes antes do texto, como as folhas do projeto). */
        void numerarDepoisDe(int secoesAnteriores) {
            secoes = secoesAnteriores;
        }

        /** Número que a última seção recebeu. */
        int ultimaSecao() {
            return secoes;
        }

        /** Seção numerada (1, 2, 3…) com um fio embaixo. */
        void secao(String texto) throws IOException {
            secao(texto, true);
        }

        void secao(String texto, boolean numerada) throws IOException {
            garantir(70);
            paginaDaSecao = paginaAtual();
            y -= 14;
            float recuo = 0;
            if (numerada) {
                secoes++;
                texto(cs, negrito, 11, ACENTO, MARGEM, y - 11, String.valueOf(secoes));
                recuo = 18;
            }
            texto(cs, negrito, 11.5f, TEXTO, MARGEM + recuo, y - 11, texto);
            y -= 16;
            cs.setStrokingColor(TEXTO);
            cs.setLineWidth(0.7f);
            cs.moveTo(MARGEM, y);
            cs.lineTo(MARGEM + LARGURA, y);
            cs.stroke();
            y -= 8;
        }

        void grupo(String texto) throws IOException {
            garantir(40);
            y -= 6;
            linhas(texto, negrito, 9.5f, TEXTO, MARGEM, LARGURA, 14);
            y -= 1;
        }

        void paragrafo(String texto) throws IOException {
            linhas(texto, normal, 9.5f, TEXTO, MARGEM, LARGURA, 13.5f);
        }

        void nota(String texto) throws IOException {
            linhas(texto, normal, 8, SUAVE, MARGEM, LARGURA, 11);
        }

        /** Grade de campos com bordas (ver {@link DocumentoTecnicoPdf#grade}). */
        void grade(List<String[]> campos, int colunas) throws IOException {
            int linhas = 0;
            int col = 0;
            for (String[] campo : campos) {
                if (campo.length > 2) {
                    linhas += col > 0 ? 2 : 1;
                    col = 0;
                } else if (++col == colunas) {
                    linhas++;
                    col = 0;
                }
            }
            linhas += col > 0 ? 1 : 0;
            garantir(linhas * 30f + 6);
            y -= DocumentoTecnicoPdf.grade(cs, normal, negrito, MARGEM, y, LARGURA, campos, colunas) + 8;
        }

        /** Texto corrido dentro de um quadro (observações). */
        void quadro(String texto) throws IOException {
            List<String> linhas = quebrar(seguro(normal, texto), normal, 9.5f, LARGURA - 20);
            float altura = linhas.size() * 13.5f + 14;
            if (y - altura < BASE) {
                linhas(texto, normal, 9.5f, TEXTO, MARGEM, LARGURA, 13.5f);
                return;
            }
            cs.setNonStrokingColor(FUNDO);
            cs.addRect(MARGEM, y - altura, LARGURA, altura);
            cs.fill();
            moldura(cs, MARGEM, y - altura, LARGURA, altura, DIVISOR, 0.5f);
            float linhaY = y - 7;
            for (String linha : linhas) {
                texto(cs, normal, 9.5f, TEXTO, MARGEM + 10, linhaY - 9.5f, linha);
                linhaY -= 13.5f;
            }
            y -= altura + 8;
        }

        /** Quadro de aviso com fio colorido à esquerda: o título e, se houver, uma lista de itens. */
        void aviso(String titulo, List<String> itens, Color cor, Color fundo) throws IOException {
            List<String> linhas = new ArrayList<>();
            for (String item : itens) {
                List<String> quebradas = quebrar(seguro(normal, item), normal, 8.5f, LARGURA - 34);
                for (int i = 0; i < quebradas.size(); i++) {
                    linhas.add((i == 0 ? "• " : "  ") + quebradas.get(i));
                }
            }
            List<String> doTitulo = quebrar(seguro(negrito, titulo), negrito, 9.5f, LARGURA - 24);
            float altura = 10 + doTitulo.size() * 13 + linhas.size() * 12 + (linhas.isEmpty() ? 0 : 3);
            garantir(Math.min(altura, TOPO - BASE));
            cs.setNonStrokingColor(fundo);
            cs.addRect(MARGEM, y - altura, LARGURA, altura);
            cs.fill();
            cs.setNonStrokingColor(cor);
            cs.addRect(MARGEM, y - altura, 3, altura);
            cs.fill();
            float linhaY = y - 6;
            for (String linha : doTitulo) {
                texto(cs, negrito, 9.5f, cor, MARGEM + 12, linhaY - 9.5f, linha);
                linhaY -= 13;
            }
            linhaY -= 2;
            for (String linha : linhas) {
                texto(cs, normal, 8.5f, TEXTO, MARGEM + 12, linhaY - 8.5f, linha);
                linhaY -= 12;
            }
            y -= altura + 8;
        }

        /**
         * Checklist em tabela: item numerado por grupo, verificação, resposta e situação (conforme, não conforme, N/A,
         * pendente). Texto longo quebra dentro da célula; o cabeçalho se repete a cada página.
         */
        void checklist(RespostasChecklist respostas) throws IOException {
            float[] larguras = {32, 215, 182, 70};
            String[] cabecalho = {"Item", "Verificação", "Resposta", "Situação"};
            garantir(ALTURA_LINHA * 3);
            cabecalhoDaTabela(cabecalho, larguras);
            String grupo = null;
            int numeroGrupo = 0;
            int numeroItem = 0;
            for (RespostasChecklist.Item item : respostas.itens()) {
                if (!item.grupo().equals(grupo)) {
                    grupo = item.grupo();
                    numeroGrupo++;
                    numeroItem = 0;
                    if (y - ALTURA_LINHA * 2 < BASE) {
                        quebrarPagina();
                        cabecalhoDaTabela(cabecalho, larguras);
                    }
                    cs.setNonStrokingColor(FUNDO);
                    cs.addRect(MARGEM, y - ALTURA_LINHA, LARGURA, ALTURA_LINHA);
                    cs.fill();
                    texto(cs, negrito, FONTE_TABELA, TEXTO, MARGEM + 4, y - ALTURA_LINHA + 4.5f, numeroGrupo + "   " + grupo.toUpperCase(PT_BR));
                    moldura(cs, MARGEM, y - ALTURA_LINHA, LARGURA, ALTURA_LINHA, BORDA, 0.4f);
                    y -= ALTURA_LINHA;
                }
                numeroItem++;
                String situacao = situacao(item);
                String[] celulas = {numeroGrupo + "." + numeroItem, item.enunciado(), resposta(item), situacao};
                boolean semResposta = "Não respondido".equals(celulas[2]);
                if (semResposta && !item.obrigatoria()) {
                    celulas[2] = "Não informado (opcional)";
                }
                PDType1Font[] fontes = {normal, normal, semResposta ? normal : negrito, negrito};
                Color[] cores = {SUAVE, TEXTO, semResposta ? SUAVE : TEXTO, corDaSituacao(situacao)};
                List<List<String>> quebradas = new ArrayList<>();
                int maior = 1;
                for (int i = 0; i < celulas.length; i++) {
                    List<String> l = quebrar(seguro(fontes[i], celulas[i]), fontes[i], FONTE_TABELA, larguras[i] - 8);
                    quebradas.add(l);
                    maior = Math.max(maior, l.size());
                }
                float altura = maior * 9.5f + 5;
                if (y - altura < BASE) {
                    quebrarPagina();
                    cabecalhoDaTabela(cabecalho, larguras);
                }
                if ("Não conforme".equals(situacao)) {
                    cs.setNonStrokingColor(FUNDO_ERRO);
                    cs.addRect(MARGEM, y - altura, LARGURA, altura);
                    cs.fill();
                }
                float x = MARGEM;
                for (int i = 0; i < celulas.length; i++) {
                    float linhaY = y - 3;
                    for (String linha : quebradas.get(i)) {
                        texto(cs, fontes[i], FONTE_TABELA, cores[i], x + 4, linhaY - FONTE_TABELA, linha);
                        linhaY -= 9.5f;
                    }
                    moldura(cs, x, y - altura, larguras[i], altura, BORDA, 0.4f);
                    x += larguras[i];
                }
                y -= altura;
            }
            y -= 8;
        }

        private void cabecalhoDaTabela(String[] cabecalho, float[] larguras) throws IOException {
            float x = MARGEM;
            for (int i = 0; i < larguras.length; i++) {
                cs.setNonStrokingColor(FUNDO_FORTE);
                cs.addRect(x, y - ALTURA_LINHA, larguras[i], ALTURA_LINHA);
                cs.fill();
                texto(cs, negrito, FONTE_TABELA, TEXTO, x + 4, y - ALTURA_LINHA + 4.5f, cabecalho[i]);
                moldura(cs, x, y - ALTURA_LINHA, larguras[i], ALTURA_LINHA, BORDA, 0.4f);
                x += larguras[i];
            }
            y -= ALTURA_LINHA;
        }

        private static float alturaDaFoto(int colunas) {
            return colunas <= 2 ? ALTURA_FOTO : (LARGURA - VAO_FOTO * (colunas - 1)) / colunas * 0.75f;
        }

        /** Garante espaço para um título e a primeira linha de fotos juntos (o título nunca fica sozinho no pé da folha). */
        void garantirFotos(int colunas) throws IOException {
            garantir(alturaDaFoto(colunas) + ALTURA_LEGENDA + 60);
        }

        /** Registro fotográfico em grade, com as fotos numeradas no documento, cada uma num quadro com item, legenda, autoria e local. */
        void fotos(List<Foto> lista, int colunas) throws IOException {
            float largura = (LARGURA - VAO_FOTO * (colunas - 1)) / colunas;
            float altura = alturaDaFoto(colunas);
            for (int i = 0; i < lista.size(); i += colunas) {
                List<Foto> linha = lista.subList(i, Math.min(i + colunas, lista.size()));
                garantir(altura + ALTURA_LEGENDA + 4);
                float topo = y;
                float x = MARGEM;
                for (Foto foto : linha) {
                    foto(foto, x, topo, largura, altura);
                    x += largura + VAO_FOTO;
                }
                y = topo - altura - ALTURA_LEGENDA - 8;
            }
        }

        private void foto(Foto foto, float x, float topo, float largura, float altura) throws IOException {
            fotos++;
            PDImageXObject imagem = PDImageXObject.createFromByteArray(documento, foto.jpeg(), foto.item());
            cs.setNonStrokingColor(FUNDO);
            cs.addRect(x, topo - altura, largura, altura);
            cs.fill();
            float escala = Math.min((largura - 6) / imagem.getWidth(), (altura - 6) / imagem.getHeight());
            float l = imagem.getWidth() * escala;
            float a = imagem.getHeight() * escala;
            cs.drawImage(imagem, x + (largura - l) / 2, topo - altura + (altura - a) / 2, l, a);
            moldura(cs, x, topo - altura, largura, altura, BORDA, 0.5f);

            float linhaY = topo - altura - 11;
            String numero = "FOTO " + String.format("%02d", fotos);
            texto(cs, negrito, 7.5f, ACENTO, x, linhaY, numero);
            float larguraCodigo = 0;
            if (foto.codigo() != null) {
                String codigo = seguro(negrito, foto.codigo());
                larguraCodigo = negrito.getStringWidth(codigo) / 1000f * 7.5f;
                texto(cs, negrito, 7.5f, TEXTO, x + largura - larguraCodigo, linhaY, codigo);
                larguraCodigo += 6;
            }
            linhaY -= 10.5f;
            String titulo = foto.etapa() != null ? foto.item() + " · " + foto.etapa() : foto.item();
            texto(cs, negrito, 8, TEXTO, x, linhaY, cortar(seguro(negrito, titulo), negrito, 8, largura));
            linhaY -= 10;
            if (foto.legenda() != null && !foto.legenda().isBlank()) {
                texto(cs, normal, 8, TEXTO, x, linhaY, cortar(seguro(normal, foto.legenda()), normal, 8, largura));
            }
            linhaY -= 10;
            if (foto.autoria() != null) {
                texto(cs, normal, 7, SUAVE, x, linhaY, cortar(seguro(normal, foto.autoria()), normal, 7, largura));
                linhaY -= 9;
            }
            if (foto.local() != null) {
                texto(cs, normal, 7, SUAVE, x, linhaY, cortar(seguro(normal, "GPS " + foto.local()), normal, 7, largura));
            }
        }

        /**
         * Tabela com o cabeçalho repetido a cada página. Cada célula ocupa uma linha; o texto que não cabe é cortado.
         * {@code total}, quando houver, fecha a tabela em negrito.
         */
        void tabela(String[] cabecalho, float[] larguras, boolean[] direita, List<String[]> linhas, String[] total) throws IOException {
            garantir(ALTURA_LINHA * 3);
            y -= 2;
            linhaDaTabela(cabecalho, larguras, direita, negrito, FUNDO_FORTE);
            for (String[] linha : linhas) {
                if (y - ALTURA_LINHA < BASE) {
                    cs.close();
                    novaPagina();
                    linhaDaTabela(cabecalho, larguras, direita, negrito, FUNDO_FORTE);
                }
                linhaDaTabela(linha, larguras, direita, normal, null);
            }
            if (total != null) {
                garantir(ALTURA_LINHA);
                linhaDaTabela(total, larguras, direita, negrito, FUNDO);
            }
            y -= 8;
        }

        private void linhaDaTabela(String[] celulas, float[] larguras, boolean[] direita, PDType1Font fonte, Color fundo) throws IOException {
            float x = MARGEM;
            for (int i = 0; i < larguras.length; i++) {
                if (fundo != null) {
                    cs.setNonStrokingColor(fundo);
                    cs.addRect(x, y - ALTURA_LINHA, larguras[i], ALTURA_LINHA);
                    cs.fill();
                }
                String texto = cortar(seguro(fonte, i < celulas.length && celulas[i] != null ? celulas[i] : ""), fonte, FONTE_TABELA, larguras[i] - 6);
                float largo = fonte.getStringWidth(texto) / 1000f * FONTE_TABELA;
                texto(cs, fonte, FONTE_TABELA, TEXTO, direita[i] ? x + larguras[i] - 3 - largo : x + 3, y - ALTURA_LINHA + 4.5f, texto);
                moldura(cs, x, y - ALTURA_LINHA, larguras[i], ALTURA_LINHA, BORDA, 0.4f);
                x += larguras[i];
            }
            y -= ALTURA_LINHA;
        }

        /** Campos de assinatura lado a lado, com o papel, o nome, a linha e a data. */
        void assinaturas(List<String[]> papeis) throws IOException {
            float altura = 74;
            garantir(altura + 10);
            y -= 4;
            caixasDeAssinatura(cs, normal, negrito, MARGEM, y, LARGURA, altura, papeis);
            y -= altura + 10;
        }

        void fechar() throws IOException {
            cs.close();
        }

        private void linhas(String texto, PDType1Font fonte, float tamanho, Color cor, float x, float largura, float entrelinha) throws IOException {
            for (String linha : quebrar(seguro(fonte, texto), fonte, tamanho, largura)) {
                garantir(entrelinha);
                texto(cs, fonte, tamanho, cor, x, y - tamanho, linha);
                y -= entrelinha;
            }
        }

        static List<String> quebrar(String texto, PDType1Font fonte, float tamanho, float largura) throws IOException {
            List<String> linhas = new ArrayList<>();
            StringBuilder atual = new StringBuilder();
            for (String palavra : texto.split(" ")) {
                String tentativa = atual.isEmpty() ? palavra : atual + " " + palavra;
                if (fonte.getStringWidth(tentativa) / 1000f * tamanho <= largura) {
                    atual = new StringBuilder(tentativa);
                    continue;
                }
                if (!atual.isEmpty()) {
                    linhas.add(atual.toString());
                }
                atual = new StringBuilder();
                String resto = palavra;
                while (fonte.getStringWidth(resto) / 1000f * tamanho > largura) {
                    int corte = resto.length() - 1;
                    while (corte > 1 && fonte.getStringWidth(resto.substring(0, corte)) / 1000f * tamanho > largura) {
                        corte--;
                    }
                    linhas.add(resto.substring(0, corte));
                    resto = resto.substring(corte);
                }
                atual.append(resto);
            }
            if (!atual.isEmpty()) {
                linhas.add(atual.toString());
            }
            if (linhas.isEmpty()) {
                linhas.add("");
            }
            return linhas;
        }

        private void garantir(float altura) throws IOException {
            if (y - altura < BASE) {
                cs.close();
                novaPagina();
            }
        }

        private void novaPagina() throws IOException {
            PDPage pagina = new PDPage(PDRectangle.A4);
            documento.addPage(pagina);
            cs = new PDPageContentStream(documento, pagina);
            y = TOPO;
        }
    }
}
