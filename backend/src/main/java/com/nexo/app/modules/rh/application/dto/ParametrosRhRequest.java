package com.nexo.app.modules.rh.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ParametrosRhRequest(
        @Schema(description = "Meses em que uma medida do mesmo motivo conta como reincidência") @NotNull Integer janelaReincidenciaMeses,
        @Schema(description = "Dias entre o fato e a aplicação acima dos quais o formulário avisa") @NotNull Integer diasImediatidade
) {
}
