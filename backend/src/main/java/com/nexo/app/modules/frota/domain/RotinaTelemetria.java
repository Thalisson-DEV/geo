package com.nexo.app.modules.frota.domain;

/** O que cada rodada de sincronização lê do provedor. */
public enum RotinaTelemetria {
    /** Veículos, posição, odômetro e motorista atual. */
    VEICULOS,
    /** Eventos de condução. */
    EVENTOS
}
