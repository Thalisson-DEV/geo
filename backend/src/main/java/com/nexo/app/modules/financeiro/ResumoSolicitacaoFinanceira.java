package com.nexo.app.modules.financeiro;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * O que outro módulo precisa saber de uma solicitação financeira para acompanhá-la.
 *
 * @param tipo   {@code COMPRA} ou {@code PAGAMENTO}
 * @param status {@code RASCUNHO}, {@code SOLICITADO}, {@code APROVADO}, {@code REJEITADO} ou {@code CANCELADO}
 */
public record ResumoSolicitacaoFinanceira(
        UUID id,
        String tipo,
        Long numero,
        String status,
        BigDecimal valor,
        BigDecimal valorAprovado,
        String fornecedor,
        String descricao,
        OffsetDateTime dataSubmissao,
        OffsetDateTime dataDecisao,
        String motivoRejeicao
) {
}
