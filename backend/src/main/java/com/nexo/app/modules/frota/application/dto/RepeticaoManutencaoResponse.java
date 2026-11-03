package com.nexo.app.modules.frota.application.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/** A OS concluída anterior com o mesmo item na mesma placa, dentro da janela. */
public record RepeticaoManutencaoResponse(
        UUID idOsAnterior,
        Long numeroOsAnterior,
        OffsetDateTime fimRealAnterior,
        Integer diasDesdeAnterior,
        int janelaDias
) {
}
