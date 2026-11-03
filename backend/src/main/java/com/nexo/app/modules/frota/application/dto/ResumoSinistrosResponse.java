package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;
import java.util.List;

/** Totais do recorte dos sinistros: por tipo, base e condutor. */
public record ResumoSinistrosResponse(
        long quantidade,
        long emAndamento,
        long comCulpaCondutor,
        BigDecimal franquiasPagas,
        List<Linha> porTipo,
        List<Linha> porBase,
        List<Linha> porCondutor
) {
    public record Linha(String chave, String rotulo, long quantidade) {
    }
}
