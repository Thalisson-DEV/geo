package com.nexo.app.modules.execucao.doc;

import com.nexo.app.modules.execucao.application.dto.MetaFisicaFilter;
import com.nexo.app.modules.execucao.application.dto.MetaFisicaRequest;
import com.nexo.app.modules.execucao.application.dto.MetaFisicaResponse;
import com.nexo.app.shared.application.dto.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

@Tag(name = "Execução - Metas físicas", description = "Meta física da Concessionária: notas por base, mês e tipo de serviço")
@SecurityRequirement(name = "bearerAuth")
public interface MetaFisicaControllerDoc {

    @Operation(summary = "Cadastrar meta física",
            description = "Uma meta ativa por base e mês. Com o total do mês da Concessionária, a meta de cada serviço é "
                    + "calculada na proporção do parcial enviado.")
    @ApiResponse(responseCode = "201", description = "Meta cadastrada")
    @ApiResponse(responseCode = "422", description = "Base já tem meta no mês ou dados inválidos")
    ResponseEntity<MetaFisicaResponse> criar(MetaFisicaRequest request);

    @Operation(summary = "Buscar meta física por ID")
    ResponseEntity<MetaFisicaResponse> buscarPorId(UUID id);

    @Operation(summary = "Listar metas físicas com filtros e paginação")
    ResponseEntity<PageResponse<MetaFisicaResponse>> listar(
            @ParameterObject MetaFisicaFilter filter, @ParameterObject Pageable pageable);

    @Operation(summary = "Atualizar os serviços de uma meta física", description = "Base e mês não mudam.")
    ResponseEntity<MetaFisicaResponse> atualizar(UUID id, MetaFisicaRequest request);

    @Operation(summary = "Desativar meta física")
    ResponseEntity<Void> desativar(UUID id);

    @Operation(summary = "Reativar meta física")
    ResponseEntity<Void> ativar(UUID id);
}
