package com.nexo.app.modules.frota.domain;

/** Onde o pneu está no ciclo: no estoque, rodando, no reparo, na reforma ou descartado. */
public enum SituacaoPneu {
    DISPONIVEL("Disponível"),
    EM_USO("Em uso"),
    EM_REPARO("Em reparo"),
    EM_REFORMA("Em reforma"),
    DESCARTADO("Descartado");

    private final String rotulo;

    SituacaoPneu(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    public boolean isEmServico() {
        return this == EM_REPARO || this == EM_REFORMA;
    }
}
