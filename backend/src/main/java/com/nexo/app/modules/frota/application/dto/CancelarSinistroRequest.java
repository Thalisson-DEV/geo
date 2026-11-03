package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CancelarSinistroRequest(
        @NotBlank(message = "Informe o motivo do cancelamento.") @Size(max = 1000) String motivo
) {
}
