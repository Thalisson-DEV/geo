package com.nexo.app.modules.frota.domain;

/** Principal: o checklist do veículo; adicional: perguntas extras de um implemento acoplado. */
public enum TipoModeloChecklist {
    PRINCIPAL("Principal"),
    ADICIONAL("Adicional por implemento");

    private final String rotulo;

    TipoModeloChecklist(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
