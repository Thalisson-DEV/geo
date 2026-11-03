package com.nexo.app.modules.frota.domain;

/** Classificação de uma parada do veículo durante o turno. */
public enum TipoParadaTurno {
    BASE("Na base"),
    SERVICO("Em serviço"),
    SEM_SERVICO("Sem serviço");

    private final String rotulo;

    TipoParadaTurno(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
