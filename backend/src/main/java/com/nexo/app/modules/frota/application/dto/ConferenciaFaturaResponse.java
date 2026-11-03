package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Conferência: os abastecimentos realizados no posto no período que estão livres ou já na
 * fatura. {@code incluido} marca os que estão nela.
 */
public record ConferenciaFaturaResponse(FaturaPostoResponse fatura, List<Candidato> abastecimentos) {

    public record Candidato(UUID id, String placa, OffsetDateTime realizadoEm, String itens, BigDecimal valor, boolean incluido) {
    }
}
