package com.nexo.app.modules.obras.doc;

import com.nexo.app.modules.obras.application.dto.TipoDeObraFilter;
import com.nexo.app.modules.obras.application.dto.TipoDeObraRequest;
import com.nexo.app.modules.obras.application.dto.TipoDeObraResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "Obras - Tipos de Obra", description = "Cadastro dos tipos de obra: material direto na obra ou na OS/OC")
@SecurityRequirement(name = "bearerAuth")
public interface TipoDeObraControllerDoc {

    @Operation(summary = "Cadastrar tipo de obra")
    ResponseEntity<TipoDeObraResponse> criar(TipoDeObraRequest request);

    @Operation(summary = "Atualizar tipo de obra")
    ResponseEntity<TipoDeObraResponse> atualizar(UUID id, TipoDeObraRequest request);

    @Operation(summary = "Buscar tipo de obra por ID")
    ResponseEntity<TipoDeObraResponse> buscarPorId(UUID id);

    @Operation(summary = "Listar tipos de obra com paginação e filtros")
    ResponseEntity<PageResponse<TipoDeObraResponse>> listar(@ParameterObject TipoDeObraFilter filter, @ParameterObject Pageable pageable);

    @Operation(summary = "Listar todos os tipos de obra ativos")
    ResponseEntity<List<TipoDeObraResponse>> listarTodosAtivos();

    @Operation(summary = "Desativar tipo de obra (Soft Delete)")
    ResponseEntity<Void> desativar(UUID id);

    @Operation(summary = "Reativar tipo de obra")
    ResponseEntity<Void> reativar(UUID id);
}
