package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.OrigemRealizacaoPreventiva;
import com.nexo.app.modules.frota.domain.SituacaoRealizacaoPreventiva;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Uma realização no histórico do controle (informada ou por OS). */
public record RealizacaoPreventivaResponse(
        UUID id,
        UUID idControle,
        String plano,
        OrigemRealizacaoPreventiva origem,
        String origemRotulo,
        SituacaoRealizacaoPreventiva situacao,
        String situacaoRotulo,
        LocalDate realizadaEm,
        Long medicao,
        UnidadeMedicao unidade,
        String observacao,
        UUID idOrdemServico,
        Long numeroOrdemServico,
        String usuario,
        OffsetDateTime registradaEm
) {
}
