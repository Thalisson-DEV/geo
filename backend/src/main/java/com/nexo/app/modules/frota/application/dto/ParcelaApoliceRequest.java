package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ParcelaApoliceRequest(
        @NotNull(message = "Informe o vencimento da parcela.") LocalDate vencimento,
        @NotNull(message = "Informe o valor da parcela.") @Positive(message = "O valor deve ser maior que zero.") BigDecimal valor
) {
}
