package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.AnexoObraResponse;
import com.nexo.app.modules.obras.domain.DocumentoAsBuilt;
import com.nexo.app.modules.obras.domain.EquipamentoObra;
import com.nexo.app.modules.obras.domain.EstruturaChecklist;
import com.nexo.app.modules.obras.domain.EvidenciaPonto;
import com.nexo.app.modules.obras.domain.FichaAsBuilt;
import com.nexo.app.modules.obras.domain.ModeloChecklistObra;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.PontoPlanejamento;
import com.nexo.app.modules.obras.domain.TipoAnexoObra;
import com.nexo.app.modules.obras.infrastructure.persistence.DocumentoAsBuiltRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.EquipamentoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.EvidenciaPontoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.FichaAsBuiltRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ItemPlanejadoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PlanejamentoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PontoPlanejamentoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.TipoAnexoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.VaoPlanejamentoRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Monta o As Built em segundo plano: as folhas do projeto com o que foi executado e, de cada ponto, a ficha e as fotos
 * do book. O arquivo entra nos anexos da obra como mais uma versão, sem tocar nas anteriores.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GeracaoAsBuiltService {

    private static final String TIPO_ANEXO = "AS BUILT";
    /** O book vai para os anexos como relatório fotográfico; sem esse tipo cadastrado, aceita um tipo "BOOK". */
    private static final List<String> TIPOS_ANEXO_BOOK = List.of("RELATÓRIO FOTOGRÁFICO", "RELATORIO FOTOGRAFICO", "BOOK");
    private static final DateTimeFormatter DATA_DA_FOTO = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private final DocumentoAsBuiltRepository documentoRepository;
    private final ObraRepository obraRepository;
    private final PlanejamentoObraRepository planejamentoRepository;
    private final PontoPlanejamentoRepository pontoRepository;
    private final VaoPlanejamentoRepository vaoRepository;
    private final ItemPlanejadoRepository itemRepository;
    private final FichaAsBuiltRepository fichaRepository;
    private final EquipamentoObraRepository equipamentoRepository;
    private final EvidenciaPontoRepository evidenciaRepository;
    private final ModeloChecklistObraUseCases modeloUseCases;
    private final ObjectStorageService objectStorage;
    private final TipoAnexoObraRepository tipoAnexoRepository;
    private final AnexoObraUseCases anexoUseCases;
    private final DocumentoTecnicoPdf documentoPdf;

    @Async
    public void processar(UUID idDocumento) {
        DocumentoAsBuilt documento = documentoRepository.findById(idDocumento).orElse(null);
        if (documento == null) {
            return;
        }
        try {
            if (documento.getTipo() == DocumentoAsBuilt.Tipo.BOOK) {
                gerarBook(documento);
            } else {
                gerar(documento);
            }
        } catch (InvarianteVioladaException e) {
            documento.falhar(e.getMessage());
        } catch (Exception e) {
            log.warn("Falha ao gerar o As Built {}", idDocumento, e);
            documento.falhar("Não foi possível gerar o documento. Confira o projeto mestre da obra e gere de novo.");
        }
        documentoRepository.save(documento);
    }

    private void gerar(DocumentoAsBuilt documento) throws IOException {
        UUID idObra = documento.getIdObra();
        Obra obra = obraRepository.findById(idObra).orElseThrow(() -> new RecursoNaoEncontradoException("Obra não encontrada."));
        TipoAnexoObra tipo = tipoAnexoRepository.findByNomeIgnoreCase(TIPO_ANEXO)
                .orElseThrow(() -> new InvarianteVioladaException("Cadastre o tipo de anexo \"AS BUILT\" para gerar o documento."));
        UUID idMestre = planejamentoRepository.findByIdObraAndAtivoTrue(idObra).orElseThrow().getIdAnexoMestre();

        byte[] projeto;
        try (InputStream stream = anexoUseCases.baixar(idObra, idMestre).stream()) {
            projeto = stream.readAllBytes();
        }
        Set<UUID> pontosExecutados = Set.copyOf(itemRepository.pontosComExecucao(idObra));
        List<PontoPlanejamento> pontos = pontoRepository.findByIdObraAndAtivoTrueOrderByPaginaAscNumeroAsc(idObra);
        List<FichaAsBuilt> fichas = fichaRepository.findByIdObraAndAtivoTrue(idObra).stream()
                .filter(f -> pontosExecutados.contains(f.getIdPonto())).toList();
        Map<UUID, List<DocumentoTecnicoPdf.Foto>> fotos = fotos(idObra, pontosExecutados);
        byte[] pdf = documentoPdf.asBuilt(new DocumentoTecnicoPdf.DadosAsBuilt(obra, documento.getNumeroVersao(), projeto, pontos, pontosExecutados,
                vaoRepository.findByIdObraAndAtivoTrue(idObra), Set.copyOf(itemRepository.vaosComExecucao(idObra)), fichas,
                equipamentoRepository.findByIdObraAndAtivoTrue(idObra), fotos));

        String nome = "as-built-" + obra.getNumero().replaceAll("[^a-zA-Z0-9._-]", "_") + "-v" + documento.getNumeroVersao() + ".pdf";
        AnexoObraResponse anexo = anexoUseCases.anexarGerado(idObra, tipo, nome, "application/pdf", pdf, "As Built, versão " + documento.getNumeroVersao());
        int totalFotos = fichas.stream().mapToInt(f -> fotos.getOrDefault(f.getIdPonto(), List.of()).size()).sum();
        documento.concluir(anexo.id(), paginas(pdf), totalFotos);
    }

    /** Book fotográfico: todos os pontos com foto ou execução, cada um com a ficha (se houver) e as fotos por etapa. */
    private void gerarBook(DocumentoAsBuilt documento) throws IOException {
        UUID idObra = documento.getIdObra();
        Obra obra = obraRepository.findById(idObra).orElseThrow(() -> new RecursoNaoEncontradoException("Obra não encontrada."));
        TipoAnexoObra tipo = TIPOS_ANEXO_BOOK.stream()
                .map(tipoAnexoRepository::findByNomeIgnoreCase)
                .flatMap(Optional::stream)
                .findFirst()
                .orElseThrow(() -> new InvarianteVioladaException("Cadastre o tipo de anexo RELATÓRIO FOTOGRÁFICO para gerar o book."));
        Set<UUID> executados = Set.copyOf(itemRepository.pontosComExecucao(idObra));
        List<EvidenciaPonto> evidencias = evidenciaRepository.findByIdObraAndAtivoTrueOrderByDataCriacaoAsc(idObra);
        Set<UUID> comFoto = evidencias.stream().map(EvidenciaPonto::getIdPonto).collect(Collectors.toSet());
        List<PontoPlanejamento> pontos = pontoRepository.findByIdObraAndAtivoTrueOrderByPaginaAscNumeroAsc(idObra).stream()
                .filter(p -> executados.contains(p.getId()) || comFoto.contains(p.getId()))
                .toList();
        Map<UUID, FichaAsBuilt> fichas = fichaRepository.findByIdObraAndAtivoTrue(idObra).stream()
                .collect(Collectors.toMap(FichaAsBuilt::getIdPonto, f -> f, (a, b) -> a));
        Map<UUID, EquipamentoObra> equipamentos = equipamentoRepository.findByIdObraAndAtivoTrue(idObra).stream()
                .collect(Collectors.toMap(EquipamentoObra::getIdPonto, e -> e, (a, b) -> a));
        Map<UUID, List<EvidenciaPonto>> evidenciasPorPonto = evidencias.stream().collect(Collectors.groupingBy(EvidenciaPonto::getIdPonto));
        Set<UUID> idsModelos = new HashSet<>();
        fichas.values().forEach(f -> idsModelos.add(f.getIdModelo()));
        evidencias.stream().map(EvidenciaPonto::getIdModelo).filter(Objects::nonNull).forEach(idsModelos::add);
        Map<UUID, ModeloChecklistObra> modelos = modeloUseCases.buscarEntidades(idsModelos).stream()
                .collect(Collectors.toMap(ModeloChecklistObra::getId, m -> m, (a, b) -> a));
        Map<UUID, List<DocumentoTecnicoPdf.Foto>> fotos = fotos(idObra, pontos.stream().map(PontoPlanejamento::getId).collect(Collectors.toSet()));

        List<DocumentoTecnicoPdf.PontoBook> doBook = new ArrayList<>();
        int fichasCompletas = 0;
        for (PontoPlanejamento ponto : pontos) {
            boolean executado = executados.contains(ponto.getId());
            FichaAsBuilt ficha = fichas.get(ponto.getId());
            List<EvidenciaPonto> doPonto = evidenciasPorPonto.getOrDefault(ponto.getId(), List.of());
            UUID idModelo = ficha != null ? ficha.getIdModelo()
                    : doPonto.stream().map(EvidenciaPonto::getIdModelo).filter(Objects::nonNull).findFirst().orElse(null);
            ModeloChecklistObra modelo = idModelo != null ? modelos.get(idModelo) : null;
            Set<String> respondidos = doPonto.stream().map(EvidenciaPonto::getIdItem).filter(Objects::nonNull).collect(Collectors.toSet());
            List<String> faltando = modelo == null ? List.of() : modelo.getEstrutura().evidencias().stream()
                    .filter(item -> item.obrigatoria() && !respondidos.contains(item.id()))
                    .map(EstruturaChecklist.ItemEvidencia::titulo)
                    .toList();
            if (executado && ficha != null && ficha.isCompleta()) {
                fichasCompletas++;
            }
            EquipamentoObra equipamento = equipamentos.get(ponto.getId());
            doBook.add(new DocumentoTecnicoPdf.PontoBook(ponto.getNumero(), ponto.getPagina(), executado, situacaoDaFicha(ficha, executado),
                    equipamento != null ? DocumentoTecnicoPdf.descreverEquipamento(equipamento) : null,
                    ficha != null ? ficha.getRespostas() : null, faltando, fotos.getOrDefault(ponto.getId(), List.of())));
        }
        int pontosExecutados = (int) pontos.stream().filter(p -> executados.contains(p.getId())).count();
        byte[] pdf = documentoPdf.book(new DocumentoTecnicoPdf.DadosBook(obra, documento.getNumeroVersao(), documento.getUsuarioCriacao(), doBook,
                pontosExecutados, fichasCompletas));
        String nome = "book-" + obra.getNumero().replaceAll("[^a-zA-Z0-9._-]", "_") + "-v" + documento.getNumeroVersao() + ".pdf";
        AnexoObraResponse anexo = anexoUseCases.anexarGerado(idObra, tipo, nome, "application/pdf", pdf, "Book de obra, versão " + documento.getNumeroVersao());
        documento.concluir(anexo.id(), paginas(pdf), doBook.stream().mapToInt(p -> p.fotos().size()).sum());
    }

    private static String situacaoDaFicha(FichaAsBuilt ficha, boolean executado) {
        if (ficha == null) {
            return executado ? "Sem ficha" : null;
        }
        if (ficha.isCompleta()) {
            return "Completa";
        }
        int faltam = ficha.getRespostas().pendencias().size();
        return faltam == 1 ? "Falta 1 resposta" : "Faltam " + faltam + " respostas";
    }

    private static int paginas(byte[] pdf) throws IOException {
        try (PDDocument lido = Loader.loadPDF(pdf)) {
            return lido.getNumberOfPages();
        }
    }

    /**
     * Fotos dos pontos executados, por ponto: primeiro os itens, na ordem do modelo, depois as avulsas. Público porque
     * o relatório de medição usa as mesmas fotos e o serviço é chamado pelo proxy do {@code @Async}.
     */
    public Map<UUID, List<DocumentoTecnicoPdf.Foto>> fotos(UUID idObra, Set<UUID> pontosExecutados) throws IOException {
        return fotos(idObra, pontosExecutados, false);
    }

    /**
     * Fotos por ponto, na ordem do modelo. Reprovada na revisão nunca entra; com {@code soAprovadas} (relatório de medição
     * detalhado), só as aprovadas.
     */
    public Map<UUID, List<DocumentoTecnicoPdf.Foto>> fotos(UUID idObra, Set<UUID> pontosExecutados, boolean soAprovadas) throws IOException {
        List<EvidenciaPonto> evidencias = evidenciaRepository.findByIdObraAndAtivoTrueOrderByDataCriacaoAsc(idObra).stream()
                .filter(e -> pontosExecutados.contains(e.getIdPonto()))
                .filter(e -> !e.reprovada())
                .filter(e -> !soAprovadas || e.getRevisao() == EvidenciaPonto.Revisao.APROVADA)
                .toList();
        Map<String, Integer> ordemDosItens = new HashMap<>();
        modeloUseCases.buscarEntidades(evidencias.stream().map(EvidenciaPonto::getIdModelo).filter(Objects::nonNull).collect(Collectors.toSet())).stream()
                .map(ModeloChecklistObra::getEstrutura)
                .map(EstruturaChecklist::evidencias)
                .forEach(itens -> itens.forEach(item -> ordemDosItens.put(item.id(), ordemDosItens.size())));
        List<EvidenciaPonto> ordenadas = evidencias.stream()
                .sorted(Comparator.comparingInt((EvidenciaPonto e) -> e.getIdItem() == null ? Integer.MAX_VALUE : ordemDosItens.getOrDefault(e.getIdItem(), Integer.MAX_VALUE - 1)))
                .toList();
        Map<UUID, List<DocumentoTecnicoPdf.Foto>> porPonto = new HashMap<>();
        for (EvidenciaPonto evidencia : ordenadas) {
            porPonto.computeIfAbsent(evidencia.getIdPonto(), id -> new ArrayList<>()).add(foto(evidencia));
        }
        return porPonto;
    }

    private DocumentoTecnicoPdf.Foto foto(EvidenciaPonto evidencia) throws IOException {
        byte[] original;
        try (InputStream stream = objectStorage.baixar(evidencia.getChaveStorage()).conteudo()) {
            original = stream.readAllBytes();
        }
        String autoria = evidencia.momentoDaFoto().atZoneSameInstant(ApontamentoExecucaoUseCases.FUSO).format(DATA_DA_FOTO)
                + (evidencia.getUsuarioCriacao() != null ? " · " + evidencia.getUsuarioCriacao() : "");
        return new DocumentoTecnicoPdf.Foto(evidencia.getTituloItem() != null ? evidencia.getTituloItem() : "Outras evidências", evidencia.getLegenda(), autoria,
                FotoEvidencia.jpeg(FotoEvidencia.ler(original), FotoEvidencia.LADO_DOCUMENTO, 0.78f), etapa(evidencia.getEtapa()));
    }

    private static String etapa(EvidenciaPonto.Etapa etapa) {
        if (etapa == null) {
            return null;
        }
        return switch (etapa) {
            case ANTES -> "Antes";
            case DURANTE -> "Durante";
            case DEPOIS -> "Depois";
        };
    }
}
