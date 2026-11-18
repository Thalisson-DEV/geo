package com.nexo.app.modules.rh.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * Registro de outro módulo que motivou a medida (ex.: a multa da frota). O RH apenas o repassa
 * no {@code MedidaDisciplinarCriadaEvent}.
 */
public record OrigemMedidaDisciplinarRequest(
        @Schema(description = "Tipo da origem", example = "FROTA_MULTA")
        @NotBlank @Size(max = 20) String tipo,
        @Schema(description = "Id do registro de origem")
        @NotNull UUID id
) {
}
