package com.nexo.app.modules.frota.domain;

/** Como a necessidade de manutenção chegou à frota. */
public enum OrigemOrdemServico {
    VERBAL("Comunicação verbal"),
    CHECKLIST("Checklist"),
    INSPECAO("Inspeção"),
    PREVENTIVA("Plano preventivo"),
    MANUAL("Lançamento manual"),
    /** Histórico trazido de outro sistema (ex.: EXP). */
    IMPORTACAO("Importação"),
    /** Reparo aberto pelo sinistro; só nasce por ele. */
    SINISTRO("Sinistro");

    private final String rotulo;

    OrigemOrdemServico(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
