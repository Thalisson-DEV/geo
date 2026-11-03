package com.nexo.app.modules.frota.application.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Filtro da lista de checklists. Datas no fuso de Brasília, inclusivas. */
public record ChecklistFilter(
        UUID idVeiculo,
        List<UUID> idsBase,
        UUID idCondutor,
        LocalDate de,
        LocalDate ate,
        Boolean comProblema
) {
}
