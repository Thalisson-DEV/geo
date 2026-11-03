package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.shared.application.dto.PageResponse;

/** Página do acompanhamento e as contagens de cada filtro rápido no mesmo recorte (base, plano, placa). */
public record AcompanhamentoPreventivaResponse(
        PageResponse<ControlePreventivoResponse> pagina,
        Contagens contagens
) {
    public record Contagens(long vencidas, long proximas, long comOs, long semHistorico, long emDia, long todas) {
    }
}
