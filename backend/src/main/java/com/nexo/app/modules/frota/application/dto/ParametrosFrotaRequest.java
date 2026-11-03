package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import jakarta.validation.Valid;

import java.time.LocalTime;
import java.util.List;

public record ParametrosFrotaRequest(
        @NotEmpty(message = "Informe ao menos uma faixa de aviso.") @Size(max = 10) List<@NotNull @Min(0) @Max(365) Integer> faixasAlertaDias,
        @NotNull(message = "Informe o limite de km por dia.") @Min(1) @Max(5000) Integer limiteKmDia,
        /** Nulo mantém a janela atual. */
        @Min(1) @Max(730) Integer janelaRepeticaoDias,
        /** Nulo mantém o limite atual. */
        @Min(1) @Max(24) Integer limiteHorasDia,
        /** Trava de KM nos lançamentos de campo. Nulo mantém o limite atual. */
        @Min(1) @Max(100_000) Integer limiteSaltoKm,
        /** Trava de horas nos lançamentos de campo. Nulo mantém; zero tira a trava. */
        @Min(0) @Max(10_000) Integer limiteSaltoHoras,
        /** Expediente que separa o uso normal do uso fora do expediente. Nulo mantém o atual. */
        @Valid Expediente expediente
) {
    public ParametrosFrotaRequest(List<Integer> faixasAlertaDias, Integer limiteKmDia) {
        this(faixasAlertaDias, limiteKmDia, null, null, null, null, null);
    }

    public record Expediente(
            @NotNull(message = "Informe o início do expediente.") LocalTime inicio,
            @NotNull(message = "Informe o fim do expediente.") LocalTime fim,
            boolean sabado
    ) {
    }
}
