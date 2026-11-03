package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.OrigemPeca;

import java.math.BigDecimal;
import java.util.UUID;

/** Peça ou consumível usado na OS. */
public record PecaOrdemServicoResponse(
        UUID id,
        String descricao,
        String codigo,
        OrigemPeca origem,
        String origemRotulo,
        BigDecimal quantidade,
        String unidade,
        BigDecimal valorUnitario,
        BigDecimal subtotal,
        UUID idMaterial,
        UUID idEstoque,
        String estoque,
        boolean baixadaNoEstoque
) {
}
