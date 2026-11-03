package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;

public record AgendarOrdemServicoRequest(
        @NotNull(message = "Informe a data do agendamento.") OffsetDateTime agendadaPara,
        @Size(max = 200) String local
) {
}
