package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

/** Ajuste de inventário: a quantidade contada substitui o saldo; a diferença fica registrada. */
public record AjusteEstoqueFrotaRequest(
        @NotNull(message = "Escolha o almoxarifado.") UUID idEstoque,
        @NotNull(message = "Escolha a peça.") UUID idMaterial,
        @NotNull(message = "Informe a quantidade contada.") @DecimalMin("0") @Digits(integer = 9, fraction = 3) BigDecimal quantidadeContada,
        @NotBlank(message = "Explique o ajuste.") @Size(max = 500) String observacao
) {
}
