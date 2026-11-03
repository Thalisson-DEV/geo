package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.MotivoEncerramentoCobertura;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** Último dia em que o veículo ficou coberto pela apólice e por que saiu. */
public record EncerrarCoberturaRequest(
        @NotNull(message = "Informe até quando o veículo ficou coberto.") LocalDate fim,
        @NotNull(message = "Informe por que o veículo saiu da apólice.") MotivoEncerramentoCobertura motivo,
        @Size(max = 300) String observacao
) {
}
