package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.CategoriaProdutoAbastecimento;
import com.nexo.app.modules.frota.domain.PrecoPostoAbastecimento;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Preço do produto no posto.
 *
 * @param vigente é o preço que vale hoje para o produto
 */
public record PrecoPostoResponse(
        UUID id,
        UUID idProduto,
        String produto,
        CategoriaProdutoAbastecimento categoria,
        String unidade,
        BigDecimal precoUnitario,
        LocalDate vigenteDesde,
        PrecoPostoAbastecimento.Origem origem,
        String origemRotulo,
        String registradoPor,
        OffsetDateTime registradoEm,
        boolean vigente
) {
}
