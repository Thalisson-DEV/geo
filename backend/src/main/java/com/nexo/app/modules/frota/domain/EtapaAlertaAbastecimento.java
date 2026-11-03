package com.nexo.app.modules.frota.domain;

/** Momento em que o alerta foi calculado. */
public enum EtapaAlertaAbastecimento {
    SOLICITACAO,
    APROVACAO,
    REALIZADO,
    /** Depois de realizado, quando a telemetria mostra onde o veículo estava. */
    TELEMETRIA
}
