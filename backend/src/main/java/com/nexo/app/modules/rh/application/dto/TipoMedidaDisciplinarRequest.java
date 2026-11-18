package com.nexo.app.modules.rh.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record TipoMedidaDisciplinarRequest(
        @NotBlank @Size(max = 80) String nome,
        @Schema(description = "1 (mais leve) a 5 (mais grave)") @NotNull @Min(1) @Max(5) Integer gravidade,
        @Schema(description = "Suspensão: a medida exige dias e início") boolean exigePeriodo
) {
}
