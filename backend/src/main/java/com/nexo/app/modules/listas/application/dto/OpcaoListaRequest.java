package com.nexo.app.modules.listas.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record OpcaoListaRequest(
        @NotBlank(message = "Informe o nome da opção") @Size(max = 80, message = "O nome tem no máximo 80 caracteres") String rotulo,
        @Size(max = 255, message = "A descrição tem no máximo 255 caracteres") String descricao,
        /** Onde a opção vale (ex.: ENTRADA, BAIXA); vazio, vale em todos. */
        List<String> contextos
) {
}
