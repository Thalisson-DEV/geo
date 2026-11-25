package com.nexo.app.modules.obras.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** O que o escritório decidiu sobre a ocorrência (ex.: "Projeto revisado na revisão 2", "Obra sai da carteira"). */
public record ResolverOcorrenciaRequest(@NotBlank(message = "Diga o que foi decidido") @Size(max = 500) String resolucao) {
}
