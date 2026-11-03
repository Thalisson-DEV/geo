package com.nexo.app.modules.frota.domain;

/** Quanto falta para a próxima realização. A ordem da declaração é a de urgência. */
public enum SituacaoPreventiva {
    VENCIDA("Vencida"),
    PROXIMA("Próxima"),
    EM_DIA("Em dia");

    private final String rotulo;

    SituacaoPreventiva(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
