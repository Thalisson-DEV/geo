package com.nexo.app.modules.desconto.domain;

/** O que aconteceu num ponto da linha do tempo do desconto. */
public enum TipoEventoDesconto {

    LANCADO("Lançado"),
    DADOS_ALTERADOS("Dados alterados"),
    ITEM_INCLUIDO("Item incluído"),
    ITEM_ALTERADO("Item alterado"),
    ITEM_REMOVIDO("Item removido"),
    ANEXO_INCLUIDO("Comprovante anexado"),
    ANEXO_REMOVIDO("Comprovante removido"),
    VALIDADO("Validado"),
    REJEITADO("Rejeitado"),
    BAIXADO("Baixado em folha"),
    FINALIZADO("Termo assinado anexado"),
    DECISAO_DESFEITA("Decisão desfeita");

    private final String rotulo;

    TipoEventoDesconto(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
