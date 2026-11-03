package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Totais do recorte: geral, por tipo (para a ficha) e o que falta mandar ao financeiro. */
public record ResumoDespesasResponse(
        long quantidade,
        BigDecimal total,
        long aPagarSemSolicitacao,
        BigDecimal valorAPagarSemSolicitacao,
        List<PorTipo> porTipo
) {
    public record PorTipo(UUID idTipo, String tipo, long quantidade, BigDecimal total) {
    }
}
