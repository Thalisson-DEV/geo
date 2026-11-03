package com.nexo.app.modules.frota.domain;

/** Natureza da manutenção da OS. */
public enum TipoManutencao {
    CORRETIVA("Corretiva"),
    PREVENTIVA("Preventiva");

    private final String rotulo;

    TipoManutencao(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
