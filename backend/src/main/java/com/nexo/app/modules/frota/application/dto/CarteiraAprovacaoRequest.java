package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

/** Placas da carteira (substitui a lista atual). */
public record CarteiraAprovacaoRequest(@NotNull(message = "Informe as placas.") List<UUID> idsVeiculo) {
}
