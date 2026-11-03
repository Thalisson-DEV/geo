package com.nexo.app.modules.frota.domain;

/** Comprovante fiscal anexado à OS. */
public enum TipoDocumentoFiscal {
    NFE("NF-e"),
    NFSE("NFS-e"),
    CUPOM("Cupom fiscal"),
    RECIBO("Recibo"),
    OUTRO("Outro");

    private final String rotulo;

    TipoDocumentoFiscal(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
