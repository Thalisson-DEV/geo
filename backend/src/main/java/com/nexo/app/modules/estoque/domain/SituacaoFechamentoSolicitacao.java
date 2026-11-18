package com.nexo.app.modules.estoque.domain;

/** Situação de uma solicitação de encerramento, derivada dos fatos registrados. */
public enum SituacaoFechamentoSolicitacao {
    AGUARDANDO_RESERVA,
    AGUARDANDO_MOVIMENTACAO,
    MOVIMENTADA_PARCIALMENTE,
    MOVIMENTADA,
    CANCELADA;

    public boolean emAndamento() {
        return this == AGUARDANDO_RESERVA || this == AGUARDANDO_MOVIMENTACAO || this == MOVIMENTADA_PARCIALMENTE;
    }
}
