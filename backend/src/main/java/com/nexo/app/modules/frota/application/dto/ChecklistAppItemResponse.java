package com.nexo.app.modules.frota.application.dto;

import java.util.UUID;

/**
 * Checklist na consulta do app. O {@code idAparelho} liga o registro do servidor ao que ainda
 * está no celular de quem preencheu (o app não repete o que já tem na fila).
 */
public record ChecklistAppItemResponse(UUID idAparelho, ChecklistResumoResponse checklist) {
}
