package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.DocumentoFiscalOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.DocumentoFiscalOrdemServicoResponse;
import com.nexo.app.modules.frota.application.usecases.DocumentoFiscalOrdemServicoUseCases;
import com.nexo.app.modules.frota.doc.DocumentoFiscalOrdemServicoFrotaControllerDoc;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/ordens-servico/{id}/documentos-fiscais")
@RequiredArgsConstructor
public class DocumentoFiscalOrdemServicoFrotaController implements DocumentoFiscalOrdemServicoFrotaControllerDoc {

    private static final String LEITURA = "hasAuthority('frota:os:read')";
    private static final String ESCRITA = "hasAnyAuthority('frota:os:write', 'frota:os:executar')";

    private final DocumentoFiscalOrdemServicoUseCases documentos;

    @Override
    @GetMapping
    @PreAuthorize(LEITURA)
    public ResponseEntity<List<DocumentoFiscalOrdemServicoResponse>> listar(@PathVariable UUID id) {
        return ResponseEntity.ok(documentos.listar(id));
    }

    @Override
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(ESCRITA)
    public ResponseEntity<DocumentoFiscalOrdemServicoResponse> criar(@PathVariable UUID id,
                                                                     @Valid @RequestPart("dados") DocumentoFiscalOrdemServicoRequest dados,
                                                                     @RequestPart(value = "arquivo", required = false) MultipartFile arquivo) {
        return ResponseEntity.status(HttpStatus.CREATED).body(documentos.criar(id, dados, arquivo));
    }

    @Override
    @PostMapping(value = "/{idDocumento}/arquivo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(ESCRITA)
    public ResponseEntity<DocumentoFiscalOrdemServicoResponse> anexar(@PathVariable UUID id, @PathVariable UUID idDocumento,
                                                                      @RequestPart("arquivo") MultipartFile arquivo) {
        return ResponseEntity.ok(documentos.anexar(id, idDocumento, arquivo));
    }

    @Override
    @GetMapping("/{idDocumento}/arquivo")
    @PreAuthorize(LEITURA)
    public ResponseEntity<Resource> baixar(@PathVariable UUID id, @PathVariable UUID idDocumento) {
        var arquivo = documentos.baixar(id, idDocumento);
        String disposition = ContentDisposition.inline()
                .filename(arquivo.nome(), StandardCharsets.UTF_8)
                .build().toString();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(arquivo.contentType()))
                .contentLength(arquivo.tamanhoBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .body(new InputStreamResource(arquivo.conteudo()));
    }

    @Override
    @DeleteMapping("/{idDocumento}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<Void> excluir(@PathVariable UUID id, @PathVariable UUID idDocumento) {
        documentos.excluir(id, idDocumento);
        return ResponseEntity.noContent().build();
    }
}
