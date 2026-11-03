package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.UUID;

/** Veículo coberto pela apólice; sem início, desde o começo da vigência; sem fim, até o fim dela. */
public record CoberturaApoliceRequest(
        @NotNull(message = "Escolha o veículo.") UUID idVeiculo,
        LocalDate inicio,
        LocalDate fim
) {
}
