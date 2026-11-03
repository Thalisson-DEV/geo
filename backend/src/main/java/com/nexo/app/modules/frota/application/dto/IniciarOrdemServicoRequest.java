package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;

public record IniciarOrdemServicoRequest(
        @NotNull(message = "Informe o início real do serviço.") OffsetDateTime inicioReal,
        OffsetDateTime previsaoTermino
) {
}
