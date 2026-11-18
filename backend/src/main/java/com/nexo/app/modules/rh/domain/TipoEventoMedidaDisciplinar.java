package com.nexo.app.modules.rh.domain;

/** O que fica no histórico da medida. Aplicada e ciência só aparecem em medidas anteriores à V211. */
public enum TipoEventoMedidaDisciplinar {
    REGISTRADA("Registrada"),
    EDITADA("Editada"),
    APLICADA("Aplicada"),
    CIENCIA_ASSINADA("Ciência assinada"),
    CIENCIA_RECUSADA("Ciência recusada"),
    CANCELADA("Cancelada"),
    ANEXO_INCLUIDO("Anexo incluído"),
    ANEXO_REMOVIDO("Anexo removido");

    private final String rotulo;

    TipoEventoMedidaDisciplinar(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
