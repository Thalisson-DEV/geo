package com.nexo.app.modules.frota.domain;

/** Como o uso do veículo é medido: odômetro em km ou horímetro em horas. */
public enum UnidadeMedicao {
    KM("km", "KM"),
    HORAS("h", "Horímetro");

    private final String sufixo;
    private final String rotulo;

    UnidadeMedicao(String sufixo, String rotulo) {
        this.sufixo = sufixo;
        this.rotulo = rotulo;
    }

    /** Sufixo exibido depois do valor, ex.: "4009 h". */
    public String sufixo() {
        return sufixo;
    }

    /** Nome da medição no começo de uma frase, ex.: "Horímetro menor que...". */
    public String rotulo() {
        return rotulo;
    }
}
