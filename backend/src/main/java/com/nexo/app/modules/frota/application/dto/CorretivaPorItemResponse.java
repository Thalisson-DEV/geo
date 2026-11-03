package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Corretivas concluídas no período por item de manutenção. {@code valor} soma o total das
 * OS que tiveram o item (uma OS com vários itens conta em cada um). {@code planos}: planos
 * ativos que já levam o item.
 */
public record CorretivaPorItemResponse(
        UUID idItem,
        String item,
        long ordens,
        long veiculos,
        BigDecimal valor,
        OffsetDateTime ultima,
        List<String> planos
) {
}
