package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AnexoOrdemServicoResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Anexos da OS", description = "Checklist da oficina assinado, fotos e laudos da OS")
public interface AnexoOrdemServicoFrotaControllerDoc {

    @Operation(summary = "Anexos da OS")
    ResponseEntity<List<AnexoOrdemServicoResponse>> listar(UUID id);

    @Operation(summary = "Anexar arquivo à OS",
            description = "Multipart: \"arquivo\" (PDF ou imagem, até 15 MB) e \"descricao\" opcional. "
                    + "Aceito em OS aberta ou concluída; recusado em cancelada. Devolve a lista atualizada.")
    @ApiResponse(responseCode = "200", description = "Anexo incluído")
    @ApiResponse(responseCode = "422", description = "OS cancelada, arquivo vazio, grande demais ou de tipo não aceito")
    ResponseEntity<List<AnexoOrdemServicoResponse>> anexar(UUID id, String descricao, MultipartFile arquivo);

    @Operation(summary = "Baixar o arquivo do anexo")
    ResponseEntity<Resource> baixar(UUID id, UUID idAnexo);

    @Operation(summary = "Excluir anexo", description = "Exclusão lógica; o arquivo fica para auditoria. Devolve a lista atualizada.")
    ResponseEntity<List<AnexoOrdemServicoResponse>> remover(UUID id, UUID idAnexo);
}
