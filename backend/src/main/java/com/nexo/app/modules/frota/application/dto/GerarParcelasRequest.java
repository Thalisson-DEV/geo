package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Parcelas mensais iguais a partir do primeiro vencimento. Sem valor, divide o valor da apólice. */
public record GerarParcelasRequest(
        @NotNull(message = "Informe a quantidade de parcelas.") @Min(1) @Max(24) Integer quantidade,
        @NotNull(message = "Informe o vencimento da primeira parcela.") LocalDate primeiroVencimento,
        @Positive BigDecimal valorTotal
) {
}
