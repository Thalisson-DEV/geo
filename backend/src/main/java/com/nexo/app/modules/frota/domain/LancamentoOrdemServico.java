package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Regras comuns de quantidade, valor unitário e subtotal dos serviços e das peças da OS. */
final class LancamentoOrdemServico {

    private static final BigDecimal QUANTIDADE_MAXIMA = new BigDecimal("999999");
    private static final BigDecimal VALOR_MAXIMO = new BigDecimal("9999999999");

    private LancamentoOrdemServico() {
    }

    static BigDecimal quantidade(BigDecimal valor) {
        if (valor == null || valor.signum() <= 0) {
            throw new InvarianteVioladaException("A quantidade deve ser maior que zero.");
        }
        if (valor.compareTo(QUANTIDADE_MAXIMA) > 0 || valor.stripTrailingZeros().scale() > 3) {
            throw new InvarianteVioladaException("Quantidade inválida (até 3 casas decimais).");
        }
        return valor.setScale(3, RoundingMode.UNNECESSARY);
    }

    static BigDecimal valorUnitario(BigDecimal valor) {
        if (valor == null || valor.signum() < 0) {
            throw new InvarianteVioladaException("Informe o valor unitário (zero ou mais).");
        }
        if (valor.compareTo(VALOR_MAXIMO) > 0 || valor.stripTrailingZeros().scale() > 4) {
            throw new InvarianteVioladaException("Valor unitário inválido (até 4 casas decimais).");
        }
        return valor.setScale(4, RoundingMode.UNNECESSARY);
    }

    /** Quantidade × valor unitário, em centavos (arredondamento bancário). */
    static BigDecimal subtotal(BigDecimal quantidade, BigDecimal valorUnitario) {
        return quantidade.multiply(valorUnitario).setScale(2, RoundingMode.HALF_EVEN);
    }
}
