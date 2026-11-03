package com.nexo.app.modules.frota.domain;

/** Como a pergunta do checklist é respondida. */
public enum TipoRespostaChecklist {
    OK_NOK("OK / Não OK"),
    OPCOES("Opções"),
    TEXTO("Texto livre");

    private final String rotulo;

    TipoRespostaChecklist(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
