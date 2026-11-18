package com.nexo.app.modules.rh.domain;

/** A medida é lançada já aplicada e pode ser cancelada com justificativa. */
public enum SituacaoMedidaDisciplinar {
    APLICADA("Aplicada"),
    CANCELADA("Cancelada");

    private final String rotulo;

    SituacaoMedidaDisciplinar(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    /** Só a medida aplicada conta para a reincidência. */
    public boolean contaParaReincidencia() {
        return this == APLICADA;
    }
}
