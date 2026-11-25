package com.nexo.app.modules.sst.domain;

/**
 * Condição do serviço que o app reconhece sozinho na programação do dia e que faz a APR sugerir riscos e medidas, ou
 * pedir uma verificação. Quem decide o que cada condição sugere é o cadastro da APR ({@link ModeloApr}); aqui fica só
 * o que o sistema sabe detectar.
 */
public enum CondicaoApr {
    SEMPRE("Todo serviço"),
    DESLIGAMENTO("Com desligamento"),
    LINHA_VIVA("Linha viva"),
    PODA("Ponto com poda"),
    ATERRAMENTO("Ponto com aterramento"),
    POSTE("Serviço de poste"),
    TRAFEGO("Tráfego na via (apontado na visita prévia)");

    private final String rotulo;

    CondicaoApr(String rotulo) {
        this.rotulo = rotulo;
    }

    public String rotulo() {
        return rotulo;
    }
}
