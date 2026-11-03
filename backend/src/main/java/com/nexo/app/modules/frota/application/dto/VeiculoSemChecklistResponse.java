package com.nexo.app.modules.frota.application.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Veículo usado hoje sem o checklist do dia, ou com troca de condutor depois do último checklist.
 *
 * @param motivo texto pronto, ex.: "Usado hoje sem checklist" ou "Condutor trocado às 14:05 sem checklist"
 */
public record VeiculoSemChecklistResponse(
        UUID idVeiculo,
        String placa,
        UUID idBaseOperacional,
        String baseNome,
        String motivo,
        OffsetDateTime ultimoChecklistEm,
        String condutorAtualNome
) {
}
