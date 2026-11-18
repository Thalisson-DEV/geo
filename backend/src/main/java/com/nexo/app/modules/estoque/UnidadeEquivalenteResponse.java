package com.nexo.app.modules.estoque;

import java.math.BigDecimal;

/**
 * "{@code quantidadeUnidade} {@code unidade} = {@code quantidadeBase} (unidade do material)".
 * {@code fator} é quanto 1 {@code unidade} vale na unidade do material.
 */
public record UnidadeEquivalenteResponse(String unidade, BigDecimal quantidadeUnidade, BigDecimal quantidadeBase, BigDecimal fator) {
}
