package com.nexo.app.modules.frota.domain;

/**
 * Urgência da OS. A ordem da declaração é a de atendimento (urgente primeiro).
 * Só a urgente sugere veículo parado: é a que impede o veículo de operar.
 */
public enum Criticidade {
    URGENTE("Urgente"),
    ALTA("Alta"),
    MEDIA("Média"),
    BAIXA("Baixa");

    private final String rotulo;

    Criticidade(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    public boolean sugereVeiculoParado() {
        return this == URGENTE;
    }
}
