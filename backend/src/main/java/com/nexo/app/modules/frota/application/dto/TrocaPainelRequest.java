package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.UnidadeMedicao;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;

/** Troca do painel (odômetro ou horímetro) do veículo. */
public record TrocaPainelRequest(
        @NotNull(message = "Informe o último valor do painel antigo.") @Min(0) @Max(9_999_999) Long valorFechamento,
        @NotNull(message = "Informe o valor inicial do painel novo.") @Min(0) @Max(9_999_999) Long valorInicial,
        /** Nula mantém a unidade atual do veículo. */
        UnidadeMedicao unidade,
        @NotNull(message = "Informe a data e hora da troca.") OffsetDateTime lidoEm,
        @Size(max = 300) String observacao
) {
}
