package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.FaturaPosto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * @param valorAbastecimentos soma dos abastecimentos ligados à fatura
 * @param diferenca           valor da fatura menos a soma dos abastecimentos (positivo: o posto cobrou a mais)
 */
public record FaturaPostoResponse(
        UUID id,
        UUID idPosto,
        String posto,
        String numero,
        LocalDate periodoInicio,
        LocalDate periodoFim,
        BigDecimal valor,
        FaturaPosto.Situacao situacao,
        String situacaoRotulo,
        int quantidadeAbastecimentos,
        BigDecimal valorAbastecimentos,
        BigDecimal diferenca,
        OffsetDateTime conferidaEm
) {
}
