package com.nexo.app.modules.rh.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MotivoMedidaDisciplinarRequest(@NotBlank @Size(max = 80) String nome) {
}
