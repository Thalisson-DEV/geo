package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

public record ItemEntradaEstoqueFrotaRequest(
        @NotNull(message = "Escolha a peça.") UUID idMaterial,
        @NotNull(message = "Informe a quantidade.") @DecimalMin(value = "0.001", message = "A quantidade deve ser maior que zero.")
        @Digits(integer = 9, fraction = 3) BigDecimal quantidade,
        @NotNull(message = "Informe o valor unitário.") @DecimalMin("0") @Digits(integer = 10, fraction = 4) BigDecimal valorUnitario
) {
}
