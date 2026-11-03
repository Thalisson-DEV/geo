package com.nexo.app.modules.frota.application.dto;

import java.util.List;

/** Aba Preventiva da ficha: os planos que acompanham o veículo e o histórico de realizações. */
public record PreventivaVeiculoResponse(
        List<ControlePreventivoResponse> controles,
        List<RealizacaoPreventivaResponse> realizacoes
) {
}
