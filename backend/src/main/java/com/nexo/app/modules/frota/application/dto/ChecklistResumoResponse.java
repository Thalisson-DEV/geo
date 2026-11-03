package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.FinalidadeChecklist;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Linha da lista de checklists. */
public record ChecklistResumoResponse(
        UUID id,
        OffsetDateTime preenchidoEm,
        UUID idVeiculo,
        String placa,
        String baseNome,
        String modeloNome,
        String condutorNome,
        String preenchidoPor,
        Long medicao,
        UnidadeMedicao unidadeMedicao,
        boolean passagemVeiculo,
        int problemas,
        int fotosAChegar,
        boolean liberacaoCnh,
        FinalidadeChecklist finalidade,
        String finalidadeRotulo,
        /** Aviso de CNH quando o condutor não estava apto e não havia liberação (o checklist vale). */
        String avisoCnh
) {
}
