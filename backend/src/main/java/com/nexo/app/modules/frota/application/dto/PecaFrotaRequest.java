package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Peça do catálogo da oficina (filtro, óleo, pastilha...). */
public record PecaFrotaRequest(
        @NotBlank(message = "Informe o código da peça.") @Size(max = 50) String codigo,
        @NotBlank(message = "Informe o nome da peça.") @Size(max = 355) String descricao,
        @NotBlank(message = "Informe a unidade (UN, L, KG...).") @Size(max = 10) String unidade,
        @Size(max = 60) String grupo
) {
}
