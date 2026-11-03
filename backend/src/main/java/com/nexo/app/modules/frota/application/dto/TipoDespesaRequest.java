package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Tipo de despesa e os subtipos, na ordem em que aparecem no formulário. */
public record TipoDespesaRequest(
        @NotBlank(message = "Informe o nome do tipo.") @Size(max = 80) String nome,
        List<@Size(max = 80) String> subtipos
) {
}
