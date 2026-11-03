package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoEventoPneu;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** @param ate inclusive */
public record EventoPneuFilter(UUID idPneu, UUID idVeiculo, List<TipoEventoPneu> tipos, LocalDate de, LocalDate ate) {
}
