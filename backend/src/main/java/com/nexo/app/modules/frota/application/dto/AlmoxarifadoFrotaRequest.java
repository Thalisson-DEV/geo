package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/** Almoxarifado da oficina da frota (estoque do tipo FROTA), em geral um por base. */
public record AlmoxarifadoFrotaRequest(
        @NotBlank(message = "Informe o nome do almoxarifado.") @Size(min = 3, max = 100) String nome,
        UUID idBaseOperacional
) {
}
