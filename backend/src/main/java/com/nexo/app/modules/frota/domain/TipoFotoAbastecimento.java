package com.nexo.app.modules.frota.domain;

public enum TipoFotoAbastecimento {
    /** Painel na solicitação: KM e nível do tanque. */
    PAINEL_ANTES("Painel antes"),
    /** Painel depois de abastecer. */
    PAINEL_DEPOIS("Painel depois"),
    CUPOM("Cupom ou nota");

    private final String rotulo;

    TipoFotoAbastecimento(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
