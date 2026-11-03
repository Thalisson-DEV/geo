package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Apólice acionada e o número do sinistro na seguradora. Sem data, vale o instante atual. */
public record AcionarSeguradoraRequest(
        @NotNull(message = "Escolha a apólice acionada.") UUID idApolice,
        @Size(max = 60) String numeroSinistroSeguradora,
        OffsetDateTime acionadaEm
) {
}
