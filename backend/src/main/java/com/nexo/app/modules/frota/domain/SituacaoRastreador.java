package com.nexo.app.modules.frota.domain;

/** Se o rastreador do provedor corresponde a um veículo da frota. */
public enum SituacaoRastreador {
    VINCULADO("Vinculado"),
    SEM_VEICULO("Sem veículo"),
    IGNORADO("Ignorado");

    private final String rotulo;

    SituacaoRastreador(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
