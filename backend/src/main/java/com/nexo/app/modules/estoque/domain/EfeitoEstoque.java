package com.nexo.app.modules.estoque.domain;

/** Efeito de uma movimentação de fechamento no saldo do GEO. */
public enum EfeitoEstoque {
    /** Altera o saldo entre o almoxarifado de atendimento e o estoque da obra. */
    FISICO,
    /** Só registro: nenhum saldo muda. */
    VIRTUAL
}
