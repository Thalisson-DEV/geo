package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

/** Liberação do gestor para o condutor dirigir o veículo no dia, mesmo com a CNH impedindo. {@code dia} vazio = hoje. */
public record LiberacaoCnhRequest(
        @NotNull(message = "Informe o condutor.") UUID idCondutor,
        @NotNull(message = "Informe o veículo.") UUID idVeiculo,
        LocalDate dia,
        @NotBlank(message = "Informe a justificativa.") @Size(max = 1000) String justificativa
) {
}
