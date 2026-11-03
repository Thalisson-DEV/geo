package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.DocumentoFiscalOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.DocumentoFiscalOrdemServicoResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Documentos fiscais da OS", description = "Notas, cupons e recibos do serviço, com arquivo anexado")
public interface DocumentoFiscalOrdemServicoFrotaControllerDoc {

    @Operation(summary = "Documentos fiscais da OS")
    ResponseEntity<List<DocumentoFiscalOrdemServicoResponse>> listar(UUID id);

    @Operation(summary = "Lançar documento fiscal",
            description = "Multipart: parte \"dados\" (JSON) e \"arquivo\" opcional (PDF, XML ou imagem, até 15 MB). "
                    + "Aceito em OS aberta ou concluída; recusado em cancelada e para nota repetida na mesma OS.")
    @ApiResponse(responseCode = "201", description = "Documento lançado")
    @ApiResponse(responseCode = "422", description = "OS cancelada, nota repetida ou dados inválidos")
    ResponseEntity<DocumentoFiscalOrdemServicoResponse> criar(UUID id, DocumentoFiscalOrdemServicoRequest dados,
                                                              MultipartFile arquivo);

    @Operation(summary = "Anexar ou trocar o arquivo do documento")
    ResponseEntity<DocumentoFiscalOrdemServicoResponse> anexar(UUID id, UUID idDocumento, MultipartFile arquivo);

    @Operation(summary = "Baixar o arquivo do documento")
    ResponseEntity<Resource> baixar(UUID id, UUID idDocumento);

    @Operation(summary = "Excluir documento fiscal", description = "Exclusão lógica; o arquivo fica para auditoria.")
    ResponseEntity<Void> excluir(UUID id, UUID idDocumento);
}
