package com.nexo.app.modules.frota.domain;

/** Onde o serviço da OS é feito. */
public enum TipoOficina {
    INTERNA("Oficina interna"),
    EXTERNA("Oficina externa");

    private final String rotulo;

    TipoOficina(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
