package com.nexo.app.modules.desconto.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DescontoDesfazerRequest(
        @NotBlank(message = "Informe o motivo.")
        @Size(min = 5, max = 1000, message = "O motivo precisa ter entre 5 e 1000 caracteres.")
        String motivo
) {}
