package com.nexo.app.modules.frota.application.dto;

/**
 * Linha da planilha de despesas (modelo C.E.S), como foi lida, com a situação da conferência.
 *
 * @param acao o que a linha vai fazer: nova despesa ou atualização da já importada
 */
public record DespesaImportacaoLinha(
        Integer linha,
        String placa,
        String data,
        String tipo,
        String subtipo,
        String valor,
        String descricao,
        String fornecedor,
        String documento,
        String numeroDocumento,
        String formaPagamento,
        String sistemaOrigem,
        String idExterno,
        String status,
        String mensagemErro,
        String acao
) {
    public DespesaImportacaoLinha com(String novoStatus, String erro, String novaAcao) {
        return new DespesaImportacaoLinha(linha, placa, data, tipo, subtipo, valor, descricao, fornecedor, documento, numeroDocumento,
                formaPagamento, sistemaOrigem, idExterno, novoStatus, erro, novaAcao);
    }
}
