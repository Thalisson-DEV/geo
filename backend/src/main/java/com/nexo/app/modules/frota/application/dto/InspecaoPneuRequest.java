package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Inspeção (calibragem e sulco) dos pneus montados num veículo. */
public record InspecaoPneuRequest(
        @NotNull(message = "Escolha o veículo.") UUID idVeiculo,
        OffsetDateTime realizadaEm,
        @Min(0) Integer km,
        UUID idResponsavel,
        @Size(max = 1000) String observacao,
        @NotEmpty(message = "Informe ao menos um pneu.") List<@Valid Item> itens
) {
    public record Item(
            @NotNull UUID idPneu,
            @Min(0) @Max(200) Integer pressaoPsi,
            @DecimalMin("0") @DecimalMax("40") @Digits(integer = 2, fraction = 1) BigDecimal sulcoMm,
            @Size(max = 300) String observacao
    ) {
    }
}
