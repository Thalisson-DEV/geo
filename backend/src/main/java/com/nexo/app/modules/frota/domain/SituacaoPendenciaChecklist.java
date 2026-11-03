package com.nexo.app.modules.frota.domain;

/** Decisão do gestor sobre um Não OK do checklist. */
public enum SituacaoPendenciaChecklist {
    ABERTA("Aberta"),
    OS_ABERTA("OS aberta"),
    RESOLVIDA_NA_HORA("Resolvida na hora"),
    DESCARTADA("Descartada");

    private final String rotulo;

    SituacaoPendenciaChecklist(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
