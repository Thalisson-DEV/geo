package com.nexo.app.modules.estoque.domain;

import java.math.BigDecimal;

/**
 * Quantidade já na unidade do material ({@code base}) e, quando a pessoa usou outra unidade,
 * o que ela digitou ({@code informada} e {@code unidadeInformada}). Sem conversão, os dois
 * últimos ficam nulos.
 */
public record QuantidadeConvertida(BigDecimal base, BigDecimal informada, String unidadeInformada) {

    public static QuantidadeConvertida semConversao(BigDecimal quantidade) {
        return new QuantidadeConvertida(quantidade, null, null);
    }

    public boolean convertida() {
        return unidadeInformada != null;
    }
}
