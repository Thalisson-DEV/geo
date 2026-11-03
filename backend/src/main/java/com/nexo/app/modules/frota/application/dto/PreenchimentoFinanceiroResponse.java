package com.nexo.app.modules.frota.application.dto;

import java.util.Map;

/**
 * Valores que a OS sabe para pré-preencher uma compra ou pagamento no financeiro, pelas
 * chaves dos campos canônicos ({@code veiculoId}, {@code baseId}, {@code regimeVeiculo},
 * {@code naturezaServico}, {@code motivoServico}, {@code descricao}, {@code observacoes},
 * {@code fornecedorId}). {@code rotulos} traz o texto de exibição das referências.
 */
public record PreenchimentoFinanceiroResponse(
        String origemTipo,
        String referencia,
        String varianteSugerida,
        Map<String, Object> valores,
        Map<String, String> rotulos
) {
}
