package com.nexo.app.modules.frota.domain;

/** Como a despesa é paga: pelo financeiro (gera solicitação) ou já paga (só registro). */
public enum FormaPagamentoDespesa {
    A_PAGAR("Pagar pelo financeiro"),
    CARTAO("Cartão corporativo"),
    REEMBOLSO("Reembolso"),
    JA_PAGO("Já pago");

    private final String rotulo;

    FormaPagamentoDespesa(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
