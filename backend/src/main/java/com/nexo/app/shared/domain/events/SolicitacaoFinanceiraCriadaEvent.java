package com.nexo.app.shared.domain.events;

import java.util.UUID;

/**
 * Uma solicitação financeira foi criada a pedido de outro módulo.
 *
 * <p>Publicado na mesma transação da criação e só quando o pedido trouxe uma origem
 * (ex.: {@code FROTA_OS} + id da ordem de serviço). O financeiro não interpreta a
 * origem; quem a reconhece grava o vínculo e, se recusar, desfaz a criação.</p>
 *
 * @param tipo {@code COMPRA} ou {@code PAGAMENTO}
 */
public record SolicitacaoFinanceiraCriadaEvent(
        UUID idSolicitacao,
        String tipo,
        String origemTipo,
        UUID origemId
) {
}
