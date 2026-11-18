package com.nexo.app.modules.estoque.domain;

/** Por que uma entrada ou baixa avulsa foi feita. */
public enum MotivoMovimentacao {
    AJUSTE_INVENTARIO,
    DEVOLUCAO_CAMPO,
    AQUISICAO_EXTRA,
    DOACAO_BONIFICACAO,
    PERDA_AVARIA,
    DANIFICACAO,
    SUCATEAMENTO,
    OBSOLESCENCIA,
    OUTROS
}
