package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;

/**
 * Totais da execução. {@code calculado} diz se o total vem dos lançamentos; falso quando
 * a OS não tem serviços nem peças e vale o valor digitado no encerramento.
 */
public record TotaisOrdemServicoResponse(
        BigDecimal servicos,
        BigDecimal pecas,
        BigDecimal desconto,
        BigDecimal acrescimo,
        BigDecimal total,
        boolean calculado
) {
}
