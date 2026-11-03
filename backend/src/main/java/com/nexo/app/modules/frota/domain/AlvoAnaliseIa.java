package com.nexo.app.modules.frota.domain;

/** Registro da frota que a IA analisa no relatório. */
public enum AlvoAnaliseIa {
    ORDEM_SERVICO("Ordem de serviço"),
    CHECKLIST("Checklist"),
    ABASTECIMENTO("Abastecimento");

    private final String rotulo;

    AlvoAnaliseIa(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
