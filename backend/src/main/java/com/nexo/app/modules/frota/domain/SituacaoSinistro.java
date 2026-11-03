package com.nexo.app.modules.frota.domain;

/**
 * Andamento do sinistro. Só avança: rascunho → em oficina → seguradora acionada → finalizado;
 * cancelado encerra de qualquer etapa aberta. Etapas podem ser puladas (furto sem reparo vai
 * direto à seguradora; reparo sem seguro vai da oficina à finalização).
 */
public enum SituacaoSinistro {
    RASCUNHO("Rascunho"),
    EM_OFICINA("Em oficina"),
    SEGURADORA_ACIONADA("Seguradora acionada"),
    FINALIZADO("Finalizado"),
    CANCELADO("Cancelado");

    private final String rotulo;

    SituacaoSinistro(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    public boolean isEncerrada() {
        return this == FINALIZADO || this == CANCELADO;
    }
}
