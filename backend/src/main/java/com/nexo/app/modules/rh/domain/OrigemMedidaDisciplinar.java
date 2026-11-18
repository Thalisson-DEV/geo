package com.nexo.app.modules.rh.domain;

/** De onde veio a medida. A origem de outro módulo é só repassada; o RH não a interpreta. */
public enum OrigemMedidaDisciplinar {
    MANUAL("Manual"),
    FROTA_MULTA("Multa da frota"),
    IMPORTACAO("Importação");

    private final String rotulo;

    OrigemMedidaDisciplinar(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
