package com.nexo.app.modules.frota.domain;

/** De onde veio uma leitura do odômetro. */
public enum OrigemLeituraOdometro {
    MANUAL, CHECKLIST, ABASTECIMENTO, MANUTENCAO, TELEMETRIA, IMPORTACAO;

    /** Digitado em campo pelo app: o valor fora da trava é recusado, não marcado. */
    public boolean isCampo() {
        return this == CHECKLIST || this == ABASTECIMENTO;
    }

    /**
     * Lido no painel por uma pessoa (ou importado de quem leu). A telemetria é estimativa: o
     * painel prevalece sobre ela.
     */
    public boolean isPainel() {
        return this != TELEMETRIA;
    }
}
