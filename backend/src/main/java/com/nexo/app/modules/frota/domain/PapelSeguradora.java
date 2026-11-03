package com.nexo.app.modules.frota.domain;

/** Papel do fornecedor no seguro da frota. */
public enum PapelSeguradora {
    SEGURADORA("Seguradora"),
    CORRETORA("Corretora");

    private final String rotulo;

    PapelSeguradora(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
