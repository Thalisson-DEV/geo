package com.nexo.app.modules.frota.domain;

/** Como o condutor de um evento de condução foi identificado. */
public enum OrigemCondutorTelemetria {
    /** O provedor informou o motorista, casado com o condutor pela CNH ou pelo nome. */
    PROVEDOR("Informado pelo rastreador"),
    /** Quem estava vinculado ao veículo no instante do evento. */
    VINCULO("Vínculo com o veículo");

    private final String rotulo;

    OrigemCondutorTelemetria(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
