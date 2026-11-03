package com.nexo.app.modules.frota.domain;

public enum SituacaoSincronizacaoTelemetria {
    OK("Sincronizado"),
    ERRO("Com erro"),
    NAO_CONFIGURADO("Não configurado");

    private final String rotulo;

    SituacaoSincronizacaoTelemetria(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
