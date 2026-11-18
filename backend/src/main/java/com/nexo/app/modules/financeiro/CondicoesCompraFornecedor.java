package com.nexo.app.modules.financeiro;

/**
 * Como a última compra com um fornecedor foi feita. Serve de sugestão para a próxima:
 * fornecedor costuma vender sempre do mesmo jeito (boleto, transferência) e no mesmo lugar.
 *
 * @param localAquisicao nome do {@code LocalAquisicao}, ou nulo
 * @param formaPagamento nome do {@code FormaPagamento}, ou nulo
 */
public record CondicoesCompraFornecedor(String localAquisicao, String formaPagamento) {
}
