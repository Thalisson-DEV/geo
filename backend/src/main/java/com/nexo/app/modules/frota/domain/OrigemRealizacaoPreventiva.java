package com.nexo.app.modules.frota.domain;

/** Como uma realização preventiva entrou no histórico. */
public enum OrigemRealizacaoPreventiva {
    /** Feita fora do sistema e informada pelo gestor. */
    INFORMADA("Informada"),
    ORDEM_SERVICO("Ordem de serviço");

    private final String rotulo;

    OrigemRealizacaoPreventiva(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
