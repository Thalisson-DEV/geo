package com.nexo.app.modules.frota.domain;

/** Quando a pergunta do checklist exige foto. */
public enum ModoFotoPergunta {
    NUNCA("Sem foto"),
    NAO_OK("Foto no Não OK"),
    SEMPRE("Foto sempre");

    private final String rotulo;

    ModoFotoPergunta(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    /** Se a resposta precisa de foto ({@code conforme} nulo nas perguntas que não são OK/Não OK). */
    public boolean exige(Boolean conforme) {
        return this == SEMPRE || (this == NAO_OK && Boolean.FALSE.equals(conforme));
    }
}
