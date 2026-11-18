package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.ControleExecucaoObra;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record TipoDeObraRequest(
        @NotBlank(message = "O nome do tipo de obra é obrigatório")
        @Size(min = 2, max = 60, message = "O nome do tipo de obra deve ter entre 2 e 60 caracteres")
        String nome,

        @Size(max = 255, message = "A descrição deve ter no máximo 255 caracteres")
        String descricao,

        @NotNull(message = "Informe para onde vai o material: direto na obra, na OS ou na OC")
        ControleExecucaoObra controleExecucao,

        Boolean subtipo
) {
}
