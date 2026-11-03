package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;
import java.util.UUID;

/** Abastecimentos que estão na fatura (substitui a lista atual). */
public record ConferirFaturaRequest(@NotEmpty(message = "Escolha os abastecimentos da fatura.") List<UUID> idsAbastecimento) {
}
