package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoFotoChecklist;

import java.util.UUID;

/** Foto do checklist; sem {@code recebida}, ainda está na fila do celular. */
public record FotoChecklistResponse(UUID id, TipoFotoChecklist tipo, String descricao, boolean recebida) {
}
