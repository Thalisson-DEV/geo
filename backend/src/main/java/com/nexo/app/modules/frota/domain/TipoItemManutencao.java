package com.nexo.app.modules.frota.domain;

/** O item de manutenção é uma peça ou consumível (óleo, filtro) ou mão de obra (revisão, alinhamento). */
public enum TipoItemManutencao {
    PECA("Peça ou consumível"),
    MAO_DE_OBRA("Mão de obra");

    private final String rotulo;

    TipoItemManutencao(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
