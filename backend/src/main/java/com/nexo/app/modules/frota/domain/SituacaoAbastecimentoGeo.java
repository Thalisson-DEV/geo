package com.nexo.app.modules.frota.domain;

/** Onde o veículo estava no instante do abastecimento, comparado com o lugar aprendido do posto. */
public enum SituacaoAbastecimentoGeo {
    NO_POSTO("No posto"),
    LONGE_DO_POSTO("Longe do posto"),
    POSTO_SEM_REFERENCIA("Posto ainda sem referência"),
    SEM_POSICAO("Sem posição do veículo");

    private final String rotulo;

    SituacaoAbastecimentoGeo(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
