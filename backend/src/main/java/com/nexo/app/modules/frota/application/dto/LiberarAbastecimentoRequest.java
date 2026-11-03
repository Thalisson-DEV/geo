package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

/**
 * Liberação pelo administrativo.
 *
 * @param idPosto     outro posto (vazio mantém o pedido)
 * @param quantidades id do item → quantidade ajustada (só os que mudam)
 */
public record LiberarAbastecimentoRequest(UUID idPosto, Map<UUID, BigDecimal> quantidades) {
}
