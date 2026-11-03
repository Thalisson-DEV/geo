package com.nexo.app.modules.frota.domain;

/** De onde vem a base do ciclo de um controle preventivo. */
public enum OrigemBasePreventiva {
    /** O plano chegou ao veículo sem histórico: conta a partir daquele dia e da medição de então. */
    INICIO("Início do acompanhamento"),
    INFORMADA("Realização informada"),
    ORDEM_SERVICO("OS concluída");

    private final String rotulo;

    OrigemBasePreventiva(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
