package com.nexo.app.modules.assistente.application.aprovacao;

import java.math.BigDecimal;

/**
 * Decisao do aprovador.
 *
 * @param valorAprovado so na aprovacao: autorizar menos do que foi pedido; nulo aprova o valor solicitado
 * @param texto         observacao da aprovacao ou motivo da rejeicao
 */
public record Decisao(Acao acao, BigDecimal valorAprovado, String texto) {

    public enum Acao { APROVAR, REJEITAR }
}
