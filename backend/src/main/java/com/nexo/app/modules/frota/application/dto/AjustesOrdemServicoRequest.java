package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;

import java.math.BigDecimal;

/** Desconto e acréscimo sobre a soma dos serviços e das peças. Nulo vale zero. */
public record AjustesOrdemServicoRequest(
        @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal desconto,
        @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal acrescimo
) {
}
