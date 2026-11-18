package com.nexo.app.modules.estoque.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record TrocarOcorrenciaTecnicaRequest(
        @NotNull Long versaoEsperada,
        @Schema(description = "Novo número da OS/OC, como digitado (com ou sem prefixo)")
        @NotBlank @Size(max = 100) String ocorrencia,
        @Schema(description = "Por que a OS/OC mudou; fica na linha do tempo")
        @NotBlank @Size(max = 500) String justificativa
) {
}
