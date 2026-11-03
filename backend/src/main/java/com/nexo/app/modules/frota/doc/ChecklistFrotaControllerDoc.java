package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.ChecklistDetalheResponse;
import com.nexo.app.modules.frota.application.dto.ChecklistFilter;
import com.nexo.app.modules.frota.application.dto.ChecklistResumoResponse;
import com.nexo.app.modules.frota.application.dto.VeiculoSemChecklistResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Checklists", description = "Checklists preenchidos, fotos e veículos sem checklist no dia")
public interface ChecklistFrotaControllerDoc {

    @Operation(summary = "Listar checklists", description = "Mais recentes primeiro. Datas no fuso de Brasília.")
    ResponseEntity<PageResponse<ChecklistResumoResponse>> listar(ChecklistFilter filtro, Pageable pageable);

    @Operation(summary = "Detalhar checklist", description = "Respostas como foram dadas, fotos e a decisão de cada problema.")
    ResponseEntity<ChecklistDetalheResponse> detalhar(UUID id);

    @Operation(summary = "Foto do checklist")
    ResponseEntity<Resource> foto(UUID id, UUID idFoto);

    @Operation(summary = "Veículos sem checklist hoje",
            description = "Usados hoje sem checklist do dia, ou com troca de condutor depois do último checklist.")
    ResponseEntity<List<VeiculoSemChecklistResponse>> semChecklistHoje(List<UUID> idsBase);
}
