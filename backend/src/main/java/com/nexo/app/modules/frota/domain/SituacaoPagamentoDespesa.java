package com.nexo.app.modules.frota.domain;

/** Situação da solicitação de pagamento aberta pela despesa no financeiro. */
public enum SituacaoPagamentoDespesa {
    SOLICITADO("Pagamento solicitado"),
    APROVADO("Pagamento aprovado"),
    REPROVADO("Pagamento reprovado");

    private final String rotulo;

    SituacaoPagamentoDespesa(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
