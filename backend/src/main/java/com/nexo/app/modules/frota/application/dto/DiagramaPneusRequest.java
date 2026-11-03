package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** @param eixos da frente para trás, S (simples) ou D (duplo), ex.: {@code S,D,D} */
public record DiagramaPneusRequest(
        @NotBlank(message = "Informe os eixos.") @Pattern(regexp = "^[SDsd](,[SDsd]){0,8}$", message = "Use S ou D por eixo, separados por vírgula.") String eixos,
        @Min(0) @Max(4) int estepes
) {
}
