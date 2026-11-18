package com.nexo.app.modules.estoque;

import java.math.BigDecimal;

/**
 * Quantidade convertida para a unidade do material ({@code quantidade}) e, quando houve
 * conversão, o que foi digitado ({@code informada} em {@code unidadeInformada}).
 */
public record QuantidadeNaUnidadeResponse(BigDecimal quantidade, BigDecimal informada, String unidadeInformada) {
}
