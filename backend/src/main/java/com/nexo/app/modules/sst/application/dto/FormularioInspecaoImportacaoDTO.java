package com.nexo.app.modules.sst.application.dto;

import com.nexo.app.shared.application.dto.ImportacaoStatus;

/**
 * Uma linha da planilha de importação de formulários: cada linha é uma pergunta,
 * e as linhas com o mesmo formulário e grupo se juntam na ordem da planilha.
 */
public record FormularioInspecaoImportacaoDTO(
        int linha,
        String formulario,
        String descricao,
        String grupo,
        String pergunta,
        String orientacao,
        String tipoResposta,
        String gravidade,
        String desvioPorColaborador,
        String obrigatoria,
        String opcoes,
        ImportacaoStatus status,
        String mensagemErro
) {
    public FormularioInspecaoImportacaoDTO withStatus(ImportacaoStatus novoStatus, String novaMensagem) {
        return new FormularioInspecaoImportacaoDTO(
                linha, formulario, descricao, grupo, pergunta, orientacao, tipoResposta, gravidade,
                desvioPorColaborador, obrigatoria, opcoes, novoStatus, novaMensagem);
    }
}
