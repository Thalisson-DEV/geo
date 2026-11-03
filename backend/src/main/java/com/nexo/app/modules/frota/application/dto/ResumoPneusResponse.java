package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;

/**
 * @param custoPorKm média do custo por km dos pneus com km rodado
 */
public record ResumoPneusResponse(
        long total,
        long emUso,
        long disponiveis,
        long emReparo,
        long emReforma,
        long descartados,
        long sulcoBaixo,
        long sulcoAtencao,
        long servicoAtrasado,
        BigDecimal sulcoMinimoMm,
        BigDecimal custoTotal,
        BigDecimal custoPorKm
) {
}
