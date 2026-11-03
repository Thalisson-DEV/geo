package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;

/** Lançamento manual de KM pela web. */
public record RegistrarLeituraRequest(
        @NotNull(message = "Informe a quilometragem.") @Min(0) @Max(9_999_999) Long km,
        @NotNull(message = "Informe a data e hora da leitura.") OffsetDateTime lidoEm,
        /** Obrigatória quando o valor passa a trava de salto ou o limite por dia. */
        @Size(max = 400) String justificativa
) {
    public RegistrarLeituraRequest(Long km, OffsetDateTime lidoEm) {
        this(km, lidoEm, null);
    }
}
