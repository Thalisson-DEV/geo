package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record FaturaPostoRequest(
        @NotNull(message = "Informe o posto.") UUID idPosto,
        @NotBlank(message = "Informe o número da fatura.") @Size(max = 60) String numero,
        @NotNull(message = "Informe o início do período.") LocalDate periodoInicio,
        @NotNull(message = "Informe o fim do período.") LocalDate periodoFim,
        @NotNull(message = "Informe o valor da fatura.") BigDecimal valor
) {
}
