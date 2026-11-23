package com.nexo.app.modules.obras.domain;

/**
 * De onde veio a revisão do orçamento da obra.
 */
public enum OrigemOrcamento {
    /** Planilha de serviços e materiais previstos (importação da listagem de obras). */
    IMPORTACAO,
    /** Montado a partir do que o planejamento dos pontos prevê, com os valores do contrato. */
    PLANEJAMENTO,
    /** Lançado item a item na ficha da obra. */
    MANUAL,
    /** Orçado da planilha orçado × faturado do relatório de medição. */
    PLANILHA_MEDICAO
}
