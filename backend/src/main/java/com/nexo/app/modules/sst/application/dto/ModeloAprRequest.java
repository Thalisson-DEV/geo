package com.nexo.app.modules.sst.application.dto;

import com.nexo.app.modules.sst.domain.EstruturaApr;
import jakarta.validation.constraints.NotNull;

public record ModeloAprRequest(
        @NotNull(message = "Informe os riscos, as medidas e as verificações da APR") EstruturaApr estrutura
) {
}
