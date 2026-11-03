package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Compra ou pagamento do financeiro vinculado à OS, com a situação lida do financeiro. */
public record OrcamentoOrdemServicoResponse(
        UUID idSolicitacao,
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
