package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.DocumentacaoTecnicaResponses;
import com.nexo.app.modules.obras.application.dto.DownloadEvidenciaDTO;
import com.nexo.app.modules.obras.domain.EvidenciaVisitaPrevia;
import com.nexo.app.modules.obras.domain.RespostasChecklist;
import com.nexo.app.modules.obras.domain.VisitaPreviaObra;
import com.nexo.app.modules.obras.infrastructure.persistence.EvidenciaVisitaPreviaRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.VisitaPreviaObraRepository;
import com.nexo.app.shared.domain.exception.ArmazenamentoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import com.nexo.app.shared.infrastructure.storage.StorageObject;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * Fotos e PDFs da visita prévia, de uma pergunta do checklist ou gerais. São opcionais: nenhuma regra da visita depende
 * delas. Removida, a evidência só sai de cena; o arquivo fica no armazenamento.
 */
@Service
@RequiredArgsConstructor
public class EvidenciaVisitaPreviaUseCases {

    static final int MAXIMO_POR_VISITA = 60;
    private static final DateTimeFormatter DATA_DA_FOTO = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private final EvidenciaVisitaPreviaRepository repository;
    private final VisitaPreviaObraRepository visitaRepository;
    private final ObjectStorageService objectStorage;

    @Transactional
    public DocumentacaoTecnicaResponses.EvidenciaVisita registrar(UUID idObra, UUID idVisita, String idPergunta, String legenda, MultipartFile arquivo) {
        VisitaPreviaObra visita = buscarVisita(idObra, idVisita);
        if (arquivo == null || arquivo.isEmpty()) {
            throw new InvarianteVioladaException("Escolha a foto ou o PDF.");
        }
        if (repository.countByIdVisitaAndAtivoTrue(idVisita) >= MAXIMO_POR_VISITA) {
            throw new InvarianteVioladaException("A visita já tem " + MAXIMO_POR_VISITA + " evidências. Remova alguma antes de lançar outra.");
        }
        EvidenciaVisitaPrevia.Pergunta pergunta = idPergunta == null || idPergunta.isBlank() ? null : pergunta(visita, idPergunta);
        byte[] conteudo = ler(arquivo);
        boolean pdf = ehPdf(conteudo);
        String contentType;
        byte[] miniatura = null;
        if (pdf) {
            contentType = EvidenciaVisitaPrevia.PDF;
        } else {
            miniatura = FotoEvidencia.jpeg(FotoEvidencia.ler(conteudo), FotoEvidencia.LADO_MINIATURA, 0.75f);
            contentType = ehPng(conteudo) ? "image/png" : "image/jpeg";
        }

        String nome = nomeSeguro(arquivo.getOriginalFilename(), pdf);
        String base = "obras/" + idObra + "/visitas/" + idVisita + "/" + UUID.randomUUID();
        String chave = base + "_" + nome;
        String chaveMiniatura = miniatura == null ? null : base + "_miniatura.jpg";
        objectStorage.enviar(chave, new ByteArrayInputStream(conteudo), conteudo.length, contentType);
        if (miniatura != null) {
            objectStorage.enviar(chaveMiniatura, new ByteArrayInputStream(miniatura), miniatura.length, "image/jpeg");
        }
        return paraResposta(repository.save(new EvidenciaVisitaPrevia(idObra, idVisita, pergunta, legenda,
                new EvidenciaVisitaPrevia.Arquivo(nome, contentType, conteudo.length, chave, chaveMiniatura))));
    }

    @Transactional
    public void alterarLegenda(UUID idObra, UUID idVisita, UUID idEvidencia, String legenda) {
        EvidenciaVisitaPrevia evidencia = buscar(idObra, idVisita, idEvidencia);
        evidencia.alterarLegenda(legenda);
        repository.save(evidencia);
    }

    @Transactional
    public void remover(UUID idObra, UUID idVisita, UUID idEvidencia) {
        EvidenciaVisitaPrevia evidencia = buscar(idObra, idVisita, idEvidencia);
        evidencia.desativar();
        repository.save(evidencia);
    }

    @Transactional(readOnly = true)
    public DownloadEvidenciaDTO baixar(UUID idObra, UUID idVisita, UUID idEvidencia) {
        EvidenciaVisitaPrevia evidencia = buscar(idObra, idVisita, idEvidencia);
        StorageObject objeto = objectStorage.baixar(evidencia.getChaveStorage());
        return new DownloadEvidenciaDTO(objeto.conteudo(), evidencia.getNomeArquivo(), evidencia.getContentType(), evidencia.getTamanhoBytes());
    }

    @Transactional(readOnly = true)
    public DownloadEvidenciaDTO baixarMiniatura(UUID idObra, UUID idVisita, UUID idEvidencia) {
        EvidenciaVisitaPrevia evidencia = buscar(idObra, idVisita, idEvidencia);
        if (evidencia.getChaveMiniatura() == null) {
            throw new RecursoNaoEncontradoException("PDF não tem miniatura.");
        }
        StorageObject objeto = objectStorage.baixar(evidencia.getChaveMiniatura());
        return new DownloadEvidenciaDTO(objeto.conteudo(), "miniatura.jpg", "image/jpeg", objeto.tamanhoBytes());
    }

    /** Fotos da visita já no tamanho do documento, na ordem do checklist e as gerais no fim; PDFs entram só pelo nome. */
    @Transactional(readOnly = true)
    public ParaDocumento paraDocumento(VisitaPreviaObra visita) {
        List<EvidenciaVisitaPrevia> todas = repository.findByIdVisitaAndAtivoTrueOrderByDataCriacaoAsc(visita.getId());
        List<String> ordem = visita.getRespostas().itens().stream().map(RespostasChecklist.Item::idPergunta).toList();
        List<EvidenciaVisitaPrevia> ordenadas = todas.stream()
                .sorted(java.util.Comparator.comparingInt(e -> e.getIdPergunta() == null ? Integer.MAX_VALUE
                        : (ordem.indexOf(e.getIdPergunta()) < 0 ? Integer.MAX_VALUE - 1 : ordem.indexOf(e.getIdPergunta()))))
                .toList();
        List<DocumentoTecnicoPdf.Foto> fotos = new ArrayList<>();
        List<String> pdfs = new ArrayList<>();
        for (EvidenciaVisitaPrevia e : ordenadas) {
            String item = e.getEnunciadoPergunta() != null ? e.getEnunciadoPergunta() : "Evidência geral";
            if (!e.isFoto()) {
                pdfs.add(item + ": " + e.getNomeArquivo() + (e.getLegenda() != null ? " · " + e.getLegenda() : ""));
                continue;
            }
            byte[] original;
            try (InputStream stream = objectStorage.baixar(e.getChaveStorage()).conteudo()) {
                original = stream.readAllBytes();
            } catch (IOException ex) {
                throw new ArmazenamentoException("Falha ao ler a foto da visita.", ex);
            }
            // Foto da visita sobe pelo web, sem carimbo: a data é a do envio, e a legenda diz isso.
            String autoria = "Enviada em " + e.getDataCriacao().atZoneSameInstant(ApontamentoExecucaoUseCases.FUSO).format(DATA_DA_FOTO)
                    + (e.getUsuarioCriacao() != null ? " · " + e.getUsuarioCriacao() : "");
            fotos.add(new DocumentoTecnicoPdf.Foto(item, e.getLegenda(), autoria,
                    FotoEvidencia.jpeg(FotoEvidencia.ler(original), FotoEvidencia.LADO_DOCUMENTO, 0.78f)));
        }
        return new ParaDocumento(fotos, pdfs);
    }

    /** O que o PDF da visita mostra das evidências. */
    public record ParaDocumento(List<DocumentoTecnicoPdf.Foto> fotos, List<String> pdfs) {
    }

    static DocumentacaoTecnicaResponses.EvidenciaVisita paraResposta(EvidenciaVisitaPrevia e) {
        return new DocumentacaoTecnicaResponses.EvidenciaVisita(e.getId(), e.getIdPergunta(), e.getEnunciadoPergunta(), e.getLegenda(), e.getNomeArquivo(),
                e.getContentType(), e.getTamanhoBytes(), e.isFoto(), e.getUsuarioCriacao(), e.getDataCriacao());
    }

    private static EvidenciaVisitaPrevia.Pergunta pergunta(VisitaPreviaObra visita, String idPergunta) {
        return visita.getRespostas().itens().stream()
                .filter(i -> i.idPergunta().equals(idPergunta))
                .findFirst()
                .map(i -> new EvidenciaVisitaPrevia.Pergunta(i.idPergunta(), i.enunciado()))
                .orElseThrow(() -> new InvarianteVioladaException("A pergunta não faz parte desta visita."));
    }

    private VisitaPreviaObra buscarVisita(UUID idObra, UUID idVisita) {
        return visitaRepository.findByIdAndIdObraAndAtivoTrue(idVisita, idObra)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Visita prévia não encontrada."));
    }

    private EvidenciaVisitaPrevia buscar(UUID idObra, UUID idVisita, UUID idEvidencia) {
        return repository.findByIdAndIdVisitaAndIdObraAndAtivoTrue(idEvidencia, idVisita, idObra)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Evidência não encontrada nesta visita."));
    }

    static boolean ehPdf(byte[] conteudo) {
        return conteudo.length > 4 && Arrays.equals(Arrays.copyOf(conteudo, 4), "%PDF".getBytes(StandardCharsets.US_ASCII));
    }

    private static boolean ehPng(byte[] conteudo) {
        return conteudo.length > 4 && (conteudo[0] & 0xff) == 0x89 && conteudo[1] == 'P' && conteudo[2] == 'N' && conteudo[3] == 'G';
    }

    private static byte[] ler(MultipartFile arquivo) {
        try {
            return arquivo.getBytes();
        } catch (IOException e) {
            throw new ArmazenamentoException("Falha ao ler o arquivo enviado.", e);
        }
    }

    private static String nomeSeguro(String nome, boolean pdf) {
        String padrao = pdf ? "documento.pdf" : "foto.jpg";
        String limpo = nome == null || nome.isBlank() ? padrao : nome.replaceAll("[^a-zA-Z0-9._-]", "_");
        return limpo.length() > 200 ? limpo.substring(limpo.length() - 200) : limpo;
    }
}
