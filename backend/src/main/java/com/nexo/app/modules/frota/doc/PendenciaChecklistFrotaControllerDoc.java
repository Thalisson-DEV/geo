package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AbrirOsPendenciasRequest;
import com.nexo.app.modules.frota.application.dto.JustificativaRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.PendenciaChecklistFilter;
import com.nexo.app.modules.frota.application.dto.PendenciaChecklistResponse;
import com.nexo.app.modules.frota.application.dto.ResolverPendenciasRequest;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Frota — Pendências do checklist", description = "Não OK esperando a decisão do gestor")
public interface PendenciaChecklistFrotaControllerDoc {

    @Operation(summary = "Fila de pendências", description = "Sem situação, só as abertas.")
    ResponseEntity<PageResponse<PendenciaChecklistResponse>> listar(PendenciaChecklistFilter filtro, Pageable pageable);

    @Operation(summary = "Abrir OS para pendências", description = "OS de origem checklist para uma ou mais pendências do mesmo veículo.")
    ResponseEntity<OrdemServicoDetalheResponse> abrirOs(AbrirOsPendenciasRequest request);

    @Operation(summary = "Registrar que foi resolvido na hora", description = "Abre e conclui a OS com o que foi feito e quem fez.")
    ResponseEntity<OrdemServicoDetalheResponse> resolverNaHora(ResolverPendenciasRequest request);

    @Operation(summary = "Descartar pendência", description = "Para o Não OK marcado por engano, com justificativa.")
    ResponseEntity<PendenciaChecklistResponse> descartar(UUID id, JustificativaRequest request);
}
