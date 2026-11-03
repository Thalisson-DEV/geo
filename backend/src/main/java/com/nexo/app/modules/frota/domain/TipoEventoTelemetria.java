package com.nexo.app.modules.frota.domain;

/** Eventos de condução que a frota importa dos provedores de telemetria. */
public enum TipoEventoTelemetria {
    EXCESSO_VELOCIDADE("Excesso de velocidade"),
    FRENAGEM_BRUSCA("Frenagem brusca"),
    ACELERACAO_BRUSCA("Aceleração brusca"),
    CURVA_BRUSCA("Curva brusca"),
    CONDUCAO_AGRESSIVA("Condução agressiva"),
    MOTOR_LIGADO_PARADO("Motor ligado parado"),
    PANICO("Pânico"),
    SEM_MOTORISTA("Sem motorista identificado"),
    DESCONEXAO_BATERIA("Desconexão da bateria");

    private final String rotulo;

    TipoEventoTelemetria(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
