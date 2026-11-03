package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DescartePneuRequest(@NotBlank(message = "Informe o motivo do descarte.") @Size(max = 300) String motivo) {
}
