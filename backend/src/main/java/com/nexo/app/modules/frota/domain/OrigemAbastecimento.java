package com.nexo.app.modules.frota.domain;

/**
 * De onde veio o abastecimento. O avulso é lançado na web por quem aprova a placa e já nasce
 * aprovado, como a solicitação direta do comercial; aparece diferenciado nas listas.
 */
public enum OrigemAbastecimento {
    APP("Pedido pelo app"),
    AVULSA("Avulso");

    private final String rotulo;

    OrigemAbastecimento(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
