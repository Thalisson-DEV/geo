package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.ModeloChecklistFilter;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistRequest;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistResponse;
import com.nexo.app.modules.frota.application.dto.ModeloChecklistResumoResponse;
import com.nexo.app.modules.frota.application.dto.ModelosVeiculoChecklistResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Frota — Modelos de checklist", description = "Perguntas do checklist por tipo de veículo e de implemento")
public interface ModeloChecklistFrotaControllerDoc {

    @Operation(summary = "Listar modelos de checklist")
    ResponseEntity<PageResponse<ModeloChecklistResumoResponse>> listar(ModeloChecklistFilter filtro, Pageable pageable);

    @Operation(summary = "Detalhar modelo", description = "Perguntas, opções, motivos e fotos de recebimento em uso.")
    ResponseEntity<ModeloChecklistResponse> buscarPorId(UUID id);

    @Operation(summary = "Criar modelo")
    ResponseEntity<ModeloChecklistResponse> criar(ModeloChecklistRequest request);

    @Operation(summary = "Atualizar modelo",
            description = "A lista de perguntas substitui a atual. O que vier com id é mantido; o que não vier é desativado, "
                    + "sem mudar os checklists já preenchidos.")
    ResponseEntity<ModeloChecklistResponse> atualizar(UUID id, ModeloChecklistRequest request);

    @Operation(summary = "Desativar modelo")
    ResponseEntity<Void> desativar(UUID id);

    @Operation(summary = "Reativar modelo")
    ResponseEntity<Void> ativar(UUID id);

    @Operation(summary = "Modelos que o veículo usa", description = "Pelo tipo de veículo da ficha e pelos implementos acoplados.")
    ResponseEntity<ModelosVeiculoChecklistResponse> modelosDoVeiculo(UUID idVeiculo);
}
