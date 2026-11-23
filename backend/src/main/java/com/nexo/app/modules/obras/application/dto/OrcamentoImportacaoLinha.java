package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.shared.application.dto.ImportacaoStatus;

/**
 * Linha da planilha do orçamento: um serviço ou material de uma obra, com a operação (instalar ou retirar; vazio é
 * instalar). Tipo vazio é serviço.
 * {@code mensagemErro} também carrega avisos (ex.: código sem Ação no contrato) em linhas válidas.
 */
public record OrcamentoImportacaoLinha(
        Integer linha,
        String numeroObra,
        String tipo,
        String operacao,
        String codigoServico,
        String descricao,
        String unidade,
        String quantidade,
        String valorUnitario,
        String valorTotal,
        String valorMaterialPrevisto,
        String valorServicoPrevisto,
        ImportacaoStatus status,
        String mensagemErro
) {
    public OrcamentoImportacaoLinha withStatus(ImportacaoStatus novoStatus, String novaMensagem) {
        return new OrcamentoImportacaoLinha(linha, numeroObra, tipo, operacao, codigoServico, descricao, unidade, quantidade,
                valorUnitario, valorTotal, valorMaterialPrevisto, valorServicoPrevisto, novoStatus, novaMensagem);
    }
}
