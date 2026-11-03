package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.ArquivoDocumentoFiscal;
import com.nexo.app.modules.frota.application.dto.DocumentoFiscalOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.DocumentoFiscalOrdemServicoResponse;
import com.nexo.app.modules.frota.domain.DocumentoFiscalOrdemServico;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.TipoEventoOrdemServico;
import com.nexo.app.modules.frota.infrastructure.persistence.DocumentoFiscalOrdemServicoRepository;
import com.nexo.app.shared.domain.exception.ArmazenamentoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import com.nexo.app.shared.infrastructure.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.text.NumberFormat;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Documentos fiscais da OS (nota, cupom, recibo), com o arquivo no armazenamento de
 * objetos. Aceitos em OS aberta ou concluída, porque a nota costuma chegar depois.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentoFiscalOrdemServicoUseCases {

    private static final long TAMANHO_MAXIMO_BYTES = 15L * 1024 * 1024;
    /** PDF e imagem, como os documentos da frota, mais o XML da NF-e. */
    private static final Map<String, String> TIPOS_PERMITIDOS = Map.of(
            "application/pdf", "pdf",
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/webp", "webp",
            "application/xml", "xml",
            "text/xml", "xml");
    private static final Locale PT_BR = Locale.of("pt", "BR");
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final DocumentoFiscalOrdemServicoRepository repository;
    private final OrdemServicoUseCases ordens;
    private final FinanceiroApi financeiro;
    private final ObjectStorageService objectStorage;

    @Transactional(readOnly = true)
    public List<DocumentoFiscalOrdemServicoResponse> listar(UUID idOs) {
        ordens.buscarEntidade(idOs);
        return montar(ativos(idOs));
    }

    /** Cria o documento e, se veio arquivo, já o anexa. */
    @Transactional
    public DocumentoFiscalOrdemServicoResponse criar(UUID idOs, DocumentoFiscalOrdemServicoRequest request,
                                                     MultipartFile arquivo) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        var documento = DocumentoFiscalOrdemServico.registrar(os, new DocumentoFiscalOrdemServico.Dados(request.tipo(),
                request.numero(), request.serie(), request.emitidoEm(), request.idFornecedor(), request.fornecedorNome(),
                request.valor()));
        if (ativos(idOs).stream().anyMatch(documento::mesmaNota)) {
            throw new InvarianteVioladaException("Este documento (" + documento.getTipo().getRotulo() + " "
                    + documento.getNumero() + ") já foi lançado nesta OS.");
        }
        documento = repository.saveAndFlush(documento);
        if (arquivo != null && !arquivo.isEmpty()) {
            enviarArquivo(documento, arquivo);
        }
        ordens.registrar(os, TipoEventoOrdemServico.DOCUMENTO_FISCAL_INCLUIDO, descrever(documento),
                SecurityUtils.getUsuarioLogadoId());
        return montar(List.of(documento)).get(0);
    }

    @Transactional
    public DocumentoFiscalOrdemServicoResponse anexar(UUID idOs, UUID idDocumento, MultipartFile arquivo) {
        var documento = buscarEntidade(idOs, idDocumento);
        enviarArquivo(documento, arquivo);
        return montar(List.of(documento)).get(0);
    }

    @Transactional(readOnly = true)
    public ArquivoDocumentoFiscal baixar(UUID idOs, UUID idDocumento) {
        var documento = buscarEntidade(idOs, idDocumento);
        if (!documento.possuiArquivo()) {
            throw new RecursoNaoEncontradoException("Este documento não tem arquivo anexado.");
        }
        var objeto = objectStorage.baixar(documento.getArquivoChave());
        return new ArquivoDocumentoFiscal(documento.getArquivoNome(), documento.getArquivoContentType(),
                documento.getArquivoTamanhoBytes(), objeto.conteudo());
    }

    /** Exclusão lógica: o documento sai da OS e o arquivo fica para auditoria. */
    @Transactional
    public void excluir(UUID idOs, UUID idDocumento) {
        OrdemServico os = ordens.buscarEntidade(idOs);
        var documento = buscarEntidade(idOs, idDocumento);
        documento.desativar();
        repository.save(documento);
        ordens.registrar(os, TipoEventoOrdemServico.DOCUMENTO_FISCAL_EXCLUIDO, descrever(documento),
                SecurityUtils.getUsuarioLogadoId());
    }

    private List<DocumentoFiscalOrdemServico> ativos(UUID idOs) {
        return repository.findAllByIdOrdemServicoAndAtivoTrueOrderByEmitidoEmAscDataCriacaoAsc(idOs);
    }

    private DocumentoFiscalOrdemServico buscarEntidade(UUID idOs, UUID idDocumento) {
        return repository.findById(idDocumento)
                .filter(DocumentoFiscalOrdemServico::isAtivo)
                .filter(d -> d.getIdOrdemServico().equals(idOs))
                .orElseThrow(() -> new RecursoNaoEncontradoException("Documento fiscal não encontrado nesta OS."));
    }

    private void enviarArquivo(DocumentoFiscalOrdemServico documento, MultipartFile arquivo) {
        if (arquivo == null || arquivo.isEmpty()) {
            throw new InvarianteVioladaException("Envie um arquivo não vazio.");
        }
        if (arquivo.getSize() > TAMANHO_MAXIMO_BYTES) {
            throw new InvarianteVioladaException("O arquivo excede o limite de 15 MB.");
        }
        String contentType = resolverContentType(arquivo);
        String chave = "frota/os/" + documento.getIdOrdemServico() + "/documentos-fiscais/" + documento.getId()
                + "/" + UUID.randomUUID() + "." + TIPOS_PERMITIDOS.get(contentType);
        try (InputStream entrada = arquivo.getInputStream()) {
            objectStorage.enviar(chave, entrada, arquivo.getSize(), contentType);
        } catch (IOException e) {
            throw new ArmazenamentoException("Falha ao ler o arquivo enviado.", e);
        }
        try {
            documento.anexarArquivo(chave, nomeSeguro(arquivo, contentType), contentType, arquivo.getSize());
            repository.saveAndFlush(documento);
        } catch (RuntimeException e) {
            removerSilenciosamente(chave);
            throw e;
        }
    }

    private void removerSilenciosamente(String chave) {
        try {
            objectStorage.remover(chave);
        } catch (RuntimeException e) {
            log.warn("Não foi possível remover o objeto órfão {}: {}", chave, e.getMessage());
        }
    }

    private List<DocumentoFiscalOrdemServicoResponse> montar(List<DocumentoFiscalOrdemServico> documentos) {
        List<UUID> idsFornecedor = documentos.stream().map(DocumentoFiscalOrdemServico::getIdFornecedor)
                .filter(Objects::nonNull).distinct().toList();
        Map<UUID, String> fornecedores = idsFornecedor.isEmpty() ? Map.of() : financeiro.nomesFornecedores(idsFornecedor);
        return documentos.stream().map(d -> new DocumentoFiscalOrdemServicoResponse(
                d.getId(),
                d.getTipo(),
                d.getTipo().getRotulo(),
                d.getNumero(),
                d.getSerie(),
                d.getEmitidoEm(),
                d.getIdFornecedor(),
                d.getIdFornecedor() != null ? fornecedores.get(d.getIdFornecedor()) : d.getFornecedorNome(),
                d.getValor(),
                d.possuiArquivo(),
                d.getArquivoNome(),
                d.getArquivoContentType(),
                d.getArquivoTamanhoBytes(),
                d.getDataCriacao(),
                d.getUsuarioCriacao())).toList();
    }

    private static String descrever(DocumentoFiscalOrdemServico d) {
        var moeda = NumberFormat.getCurrencyInstance(PT_BR);
        return d.getTipo().getRotulo() + " " + d.getNumero() + (d.getSerie() == null ? "" : " série " + d.getSerie())
                + " de " + DATA.format(d.getEmitidoEm()) + ", " + moeda.format(d.getValor()).replace(' ', ' ') + ".";
    }

    private static String resolverContentType(MultipartFile arquivo) {
        String informado = arquivo.getContentType() == null ? null
                : arquivo.getContentType().toLowerCase(Locale.ROOT).split(";")[0].trim();
        if (informado != null && TIPOS_PERMITIDOS.containsKey(informado)) {
            return informado;
        }
        String extensao = StringUtils.getFilenameExtension(arquivo.getOriginalFilename());
        if (extensao != null) {
            String ext = extensao.toLowerCase(Locale.ROOT);
            if (ext.equals("jpeg")) ext = "jpg";
            for (var entrada : TIPOS_PERMITIDOS.entrySet()) {
                if (entrada.getValue().equals(ext)) return entrada.getKey();
            }
        }
        throw new InvarianteVioladaException("Tipo de arquivo não suportado. Envie PDF, XML ou imagem (JPG, PNG, WEBP).");
    }

    private static String nomeSeguro(MultipartFile arquivo, String contentType) {
        String original = arquivo.getOriginalFilename();
        String nome = StringUtils.hasText(original) ? StringUtils.getFilename(StringUtils.cleanPath(original)) : null;
        if (!StringUtils.hasText(nome)) {
            nome = "documento-fiscal." + TIPOS_PERMITIDOS.get(contentType);
        }
        return nome.length() <= 255 ? nome : nome.substring(nome.length() - 255);
    }
}
