package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/** Controles escolhidos no acompanhamento; sai uma OS por veículo. */
public record AbrirOsPreventivaRequest(
        @NotEmpty(message = "Escolha ao menos um plano.") @Size(max = 100) List<@NotNull UUID> idsControle
) {
}
