package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.TipoItemKit;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Item do kit com os dados da referência (Ação ou Material) já resolvidos para exibição.
 * {@code valorUnitario} e {@code valorTotal}: no serviço, o valor vigente do contrato; no material, o valor orçado no kit.
 * Ficam vazios quando não há valor.
 */
public record ItemKitResponse(
        UUID id,
        TipoItemKit tipo,
        UUID idReferencia,
        String codigoReferencia,
        String descricaoReferencia,
        OperacaoItemKit operacao,
        String unidade,
        BigDecimal quantidade,
        BigDecimal valorUnitario,
        BigDecimal valorTotal
) {
}
