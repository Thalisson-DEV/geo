package com.nexo.app.modules.frota.application.dto;

/**
 * Pedido de abastecimento para o gestor decidir no celular: o pedido completo e o que o
 * Assistente apontou (nulo enquanto a análise não saiu).
 */
public record AprovacaoAbastecimentoAppResponse(
        AbastecimentoDetalheResponse abastecimento,
        AnaliseIaResponse analise
) {
}
