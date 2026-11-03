package com.nexo.app.modules.frota.domain;

/** A realização por OS fica aberta até a OS ser concluída ou cancelada; a informada já nasce concluída. */
public enum SituacaoRealizacaoPreventiva {
    ABERTA("Em execução"),
    CONCLUIDA("Realizada"),
    CANCELADA("Cancelada");

    private final String rotulo;

    SituacaoRealizacaoPreventiva(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
