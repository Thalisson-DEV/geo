package com.nexo.app.modules.frota.domain;

/**
 * De onde veio a peça usada na OS. {@link #ESTOQUE} com a peça do catálogo da frota dá baixa no
 * almoxarifado da oficina; sem a peça (lançamentos antigos), só registra a origem.
 */
public enum OrigemPeca {
    ESTOQUE("Estoque"),
    COMPRA("Compra");

    private final String rotulo;

    OrigemPeca(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
