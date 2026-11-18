package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;
import java.util.UUID;

/** Mão de obra lançada na OS. {@code mecanico} é o nome do colaborador ou o nome livre. */
public record ServicoOrdemServicoResponse(
        UUID id,
        String descricao,
        UUID idItemManutencao,
        String itemManutencao,
        UUID idMecanico,
        String mecanico,
        BigDecimal quantidade,
        BigDecimal valorUnitario,
        BigDecimal subtotal,
        boolean semCusto
) {
}
