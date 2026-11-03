package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;

public record PrevisaoOrdemServicoRequest(
        @NotNull(message = "Informe a nova previsão de término.") OffsetDateTime previsaoTermino
) {
}
