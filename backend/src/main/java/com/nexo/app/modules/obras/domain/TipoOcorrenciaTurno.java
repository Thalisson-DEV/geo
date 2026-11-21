package com.nexo.app.modules.obras.domain;

/**
 * O que atrapalhou ou chamou atenção no turno de uma equipe de Obras.
 */
public enum TipoOcorrenciaTurno {
    SEGURANCA("Segurança"),
    CLIMA("Clima"),
    MATERIAL("Falta de material"),
    EQUIPAMENTO("Veículo ou equipamento"),
    ACESSO("Acesso ao local"),
    DESLIGAMENTO("Desligamento"),
    TERCEIROS("Terceiros ou clientes"),
    OUTROS("Outros");

    private final String rotulo;

    TipoOcorrenciaTurno(String rotulo) {
        this.rotulo = rotulo;
    }

    /** O mesmo texto do web e do app. */
    public String rotulo() {
        return rotulo;
    }
}
