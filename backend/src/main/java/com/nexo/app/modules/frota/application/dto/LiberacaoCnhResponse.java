package com.nexo.app.modules.frota.application.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record LiberacaoCnhResponse(
        UUID id,
        UUID idCondutor,
        String condutorNome,
        UUID idVeiculo,
        String placa,
        LocalDate dia,
        String justificativa,
        String liberadoPor,
        OffsetDateTime liberadoEm
) {
}
