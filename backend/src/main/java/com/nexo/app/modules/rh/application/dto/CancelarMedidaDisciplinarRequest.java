package com.nexo.app.modules.rh.application.dto;

import jakarta.validation.constraints.Size;

public record CancelarMedidaDisciplinarRequest(
        @Size(max = 500) String justificativa
) {
}
