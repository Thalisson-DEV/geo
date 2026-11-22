package com.nexo.app.modules.obras.application.dto;

import java.math.BigDecimal;

/**
 * Totais do recorte filtrado da listagem de obras. O {@code valorProjeto} soma o valor da carteira e, na obra que ainda não
 * tem esse valor, o do planejamento (kits): {@code valorPeloPlanejamento} e {@code obrasPeloPlanejamento} dizem quanto
 * desse total veio do planejamento.
 */
public record IndicadoresCarteiraResponse(
        long quantidade,
        BigDecimal valorProjeto,
        BigDecimal valorPeloPlanejamento,
        long obrasPeloPlanejamento,
        BigDecimal valorMaterialPrevisto,
        BigDecimal valorServicoPrevisto,
        long municipios
) {
}
