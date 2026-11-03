package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoEventoOrdemServico;

import java.time.OffsetDateTime;

public record HistoricoOrdemServicoResponse(
        TipoEventoOrdemServico tipo,
        String tipoRotulo,
        String descricao,
        String usuario,
        OffsetDateTime ocorridoEm
) {
}
