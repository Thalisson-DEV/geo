package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;

/** Marca ({@code parado = true}) ou libera o veículo. {@code instante} nulo usa o atual. */
public record ParadaVeiculoRequest(
        @NotNull(message = "Informe se o veículo está parado.") Boolean parado,
        OffsetDateTime instante
) {
}
