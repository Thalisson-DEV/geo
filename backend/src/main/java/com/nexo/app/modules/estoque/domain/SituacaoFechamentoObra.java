package com.nexo.app.modules.estoque.domain;

import java.util.Collection;

/** Situação do fechamento de uma obra, a partir das suas solicitações não canceladas. */
public enum SituacaoFechamentoObra {
    SEM_SOLICITACOES,
    PENDENTE,
    PARCIAL,
    FINALIZADO;

    /**
     * @param situacoes situações das solicitações de encerramento da obra
     * @param algumaQuantidadeMovimentada se há quantidade movimentada líquida em alguma solicitação
     */
    public static SituacaoFechamentoObra de(
            Collection<SituacaoFechamentoSolicitacao> situacoes,
            boolean algumaQuantidadeMovimentada
    ) {
        var validas = situacoes.stream().filter(s -> s != SituacaoFechamentoSolicitacao.CANCELADA).toList();
        if (validas.isEmpty()) {
            return SEM_SOLICITACOES;
        }
        if (validas.stream().allMatch(s -> s == SituacaoFechamentoSolicitacao.MOVIMENTADA)) {
            return FINALIZADO;
        }
        boolean houveMovimentacao = algumaQuantidadeMovimentada || validas.stream().anyMatch(s ->
                s == SituacaoFechamentoSolicitacao.MOVIMENTADA || s == SituacaoFechamentoSolicitacao.MOVIMENTADA_PARCIALMENTE);
        return houveMovimentacao ? PARCIAL : PENDENTE;
    }
}
