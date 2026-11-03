package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Não OK de um checklist na fila do gestor.
 *
 * @param resumo         pergunta e motivo, ex.: "Faróis — Queimado"
 * @param fotosAChegar   fotos ainda na fila do celular de quem preencheu
 */
public record PendenciaChecklistResponse(
        UUID id,
        SituacaoPendenciaChecklist situacao,
        String situacaoRotulo,
        UUID idChecklist,
        OffsetDateTime preenchidoEm,
        UUID idVeiculo,
        String placa,
        String baseNome,
        String condutorNome,
        String grupo,
        String pergunta,
        String resumo,
        String comentario,
        List<FotoChecklistResponse> fotos,
        int fotosAChegar,
        UUID idOrdemServico,
        Long numeroOrdemServico,
        String justificativa,
        String decididaPor,
        OffsetDateTime decididaEm,
        HistoricoItemChecklistResponse historico
) {
}
