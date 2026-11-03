package com.nexo.app.modules.frota.domain;

/** O que o posto entrega: cada categoria vira um item separado na solicitação. */
public enum CategoriaProdutoAbastecimento {
    COMBUSTIVEL("Combustível"),
    ARLA("ARLA"),
    OLEO("Óleo"),
    FLUIDO("Fluido");

    private final String rotulo;

    CategoriaProdutoAbastecimento(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
