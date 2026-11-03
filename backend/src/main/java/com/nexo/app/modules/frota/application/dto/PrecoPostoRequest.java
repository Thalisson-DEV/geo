package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** Preço de um produto no posto. Sem data, vale a partir de hoje. */
public record PrecoPostoRequest(
        @NotNull(message = "Informe o produto.") UUID idProduto,
        @NotNull(message = "Informe o preço.") @DecimalMin(value = "0.001", message = "O preço precisa ser maior que zero.")
        @Digits(integer = 9, fraction = 3) BigDecimal precoUnitario,
        LocalDate vigenteDesde
) {
}
