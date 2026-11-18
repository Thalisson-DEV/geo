package com.nexo.app.modules.estoque.domain;

/** Fatos operacionais imutáveis de uma solicitação técnica ou de fechamento. */
public enum TipoOperacaoSolicitacao {
    ENTREGA,
    DEVOLUCAO,
    ESTORNO,
    ENCERRAMENTO,
    /** Marcação de movimentado no fechamento (almoxarifado já movimentou no SAP). */
    MOVIMENTACAO
}
