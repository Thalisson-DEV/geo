package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** Revisão feita fora do sistema: vira a base do ciclo. A medição é a do painel atual do veículo. */
public record InformarRealizacaoPreventivaRequest(
        @NotNull(message = "Informe a data da realização.") LocalDate data,
        @PositiveOrZero Long medicao,
        @Size(max = 1000) String observacao
) {
}
