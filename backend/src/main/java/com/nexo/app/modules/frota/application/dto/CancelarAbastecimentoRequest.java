package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.Size;

/** Motivo do cancelamento: opcional antes da liberação, obrigatório depois. */
public record CancelarAbastecimentoRequest(@Size(max = 500) String motivo) {
}
