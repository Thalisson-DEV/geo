package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.TipoItemKit;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Item lançado no orçamento pela ficha. {@code idReferencia} é a Ação do contrato (serviço) ou o material do catálogo.
 * Sem valor unitário, o serviço usa o valor vigente do contrato da obra.
 */
public record ItemOrcamentoObraRequest(
        @NotNull(message = "Informe se é serviço ou material.") TipoItemKit tipo,
        @NotNull(message = "Escolha o serviço ou o material.") UUID idReferencia,
        OperacaoItemKit operacao,
        @NotNull(message = "Informe a quantidade orçada.") @DecimalMin(value = "0", message = "A quantidade não pode ser negativa.") BigDecimal quantidade,
        @DecimalMin(value = "0", message = "O valor unitário não pode ser negativo.") BigDecimal valorUnitario
) {
}
