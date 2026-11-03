package com.nexo.app.modules.financeiro.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * Registro de outro módulo que motivou a solicitação (ex.: a OS da frota). Só é lido
 * na criação, e o financeiro apenas o repassa no {@code SolicitacaoFinanceiraCriadaEvent}.
 */
public record OrigemSolicitacaoRequest(
        @Schema(description = "Tipo da origem", example = "FROTA_OS")
        @NotBlank @Size(max = 40) String tipo,
        @Schema(description = "Id do registro de origem")
        @NotNull UUID id
) {
}
