package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.NaturezaServico;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Item do catálogo de manutenção. {@code diasRepeticao} nulo usa a janela padrão. */
public record ItemManutencaoRequest(
        @NotBlank(message = "Informe o nome do item.") @Size(max = 120) String nome,
        @NotNull(message = "Informe a natureza do serviço.") NaturezaServico natureza,
        @Size(max = 255) String descricao,
        @Min(1) @Max(730) Integer diasRepeticao
) {
}
