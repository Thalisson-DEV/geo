package com.nexo.app.modules.frota.domain;

/** O que aconteceu com o veículo (as listas do EXP). */
public enum TipoSinistro {
    COLISAO_SEM_VITIMA("Colisão sem vítima"),
    COLISAO_COM_VITIMA("Colisão com vítima"),
    SEM_TERCEIROS("Sem terceiros envolvidos"),
    INTRAFROTA("Intrafrota"),
    CARGA_AVARIADA("Carga avariada"),
    FURTO("Furto"),
    ASSALTO("Assalto");

    private final String rotulo;

    TipoSinistro(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
