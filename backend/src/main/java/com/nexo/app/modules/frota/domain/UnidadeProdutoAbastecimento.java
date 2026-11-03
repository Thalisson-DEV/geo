package com.nexo.app.modules.frota.domain;

public enum UnidadeProdutoAbastecimento {
    L("Litro", "l"),
    UN("Unidade", "un");

    private final String rotulo;
    private final String sigla;

    UnidadeProdutoAbastecimento(String rotulo, String sigla) {
        this.rotulo = rotulo;
        this.sigla = sigla;
    }

    public String getRotulo() {
        return rotulo;
    }

    public String getSigla() {
        return sigla;
    }
}
