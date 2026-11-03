package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/** Atalho: inclui na carteira as placas ativas da base neste momento. */
public record IncluirBaseCarteiraRequest(@NotNull(message = "Informe a base.") UUID idBaseOperacional) {
}
