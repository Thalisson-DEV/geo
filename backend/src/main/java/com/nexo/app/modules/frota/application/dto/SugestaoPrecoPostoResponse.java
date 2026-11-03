package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.SugestaoPrecoPosto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Preço lido no cupom diferente do cadastrado no posto, à espera de quem confirma. */
public record SugestaoPrecoPostoResponse(
        UUID id,
        UUID idAbastecimento,
        UUID idPosto,
        String posto,
        UUID idProduto,
        String produto,
        BigDecimal precoCadastrado,
        BigDecimal precoCupom,
        LocalDate dataCupom,
        SugestaoPrecoPosto.Situacao situacao,
        String situacaoRotulo,
        String decididoPor,
        OffsetDateTime decididoEm,
        OffsetDateTime criadoEm
) {
}
