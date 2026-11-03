package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

/** Encerramento do sinistro, com a franquia paga à seguradora quando houver. */
public record FinalizarSinistroRequest(
        @PositiveOrZero BigDecimal franquiaPaga
) {
}
