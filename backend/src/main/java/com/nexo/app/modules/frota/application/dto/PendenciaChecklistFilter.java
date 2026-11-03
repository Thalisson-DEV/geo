package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist;

import java.util.List;
import java.util.UUID;

/** Fila de pendências. Sem situação, lista só as abertas. */
public record PendenciaChecklistFilter(SituacaoPendenciaChecklist situacao, List<UUID> idsBase, UUID idVeiculo) {
}
