package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/** Ajuste de um item do orçamento atual: operação, quantidade e valor unitário. */
public record AlterarItemOrcamentoObraRequest(
        OperacaoItemKit operacao,
        @NotNull(message = "Informe a quantidade orçada.") @DecimalMin(value = "0", message = "A quantidade não pode ser negativa.") BigDecimal quantidade,
        @DecimalMin(value = "0", message = "O valor unitário não pode ser negativo.") BigDecimal valorUnitario
) {
}
