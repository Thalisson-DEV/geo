package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.ItemManutencaoFilter;
import com.nexo.app.modules.frota.application.dto.ItemManutencaoRequest;
import com.nexo.app.modules.frota.application.dto.ItemManutencaoResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Frota — Itens de manutenção", description = "Catálogo de serviços e peças da OS e da repetição")
public interface ItemManutencaoFrotaControllerDoc {

    @Operation(summary = "Listar itens de manutenção")
    ResponseEntity<PageResponse<ItemManutencaoResponse>> listar(ItemManutencaoFilter filtro, Pageable pageable);

    @Operation(summary = "Buscar item de manutenção")
    ResponseEntity<ItemManutencaoResponse> buscar(UUID id);

    @Operation(summary = "Cadastrar item de manutenção")
    ResponseEntity<ItemManutencaoResponse> criar(ItemManutencaoRequest request);

    @Operation(summary = "Atualizar item de manutenção")
    ResponseEntity<ItemManutencaoResponse> atualizar(UUID id, ItemManutencaoRequest request);

    @Operation(summary = "Desativar item de manutenção", description = "OS existentes continuam com o item.")
    ResponseEntity<Void> desativar(UUID id);

    @Operation(summary = "Reativar item de manutenção")
    ResponseEntity<Void> ativar(UUID id);
}
