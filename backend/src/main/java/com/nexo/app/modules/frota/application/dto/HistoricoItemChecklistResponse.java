package com.nexo.app.modules.frota.application.dto;

import java.time.OffsetDateTime;

/**
 * Histórico do item com problema no veículo, para a análise rápida: "Não OK há 5 dias, em 3
 * checklists seguidos; 4 vezes nos últimos 30 dias; último OK em 10/10".
 */
public record HistoricoItemChecklistResponse(
        OffsetDateTime problemaDesde,
        long diasComProblema,
        int checklistsSeguidos,
        int vezes30Dias,
        OffsetDateTime ultimoOkEm
) {
}
