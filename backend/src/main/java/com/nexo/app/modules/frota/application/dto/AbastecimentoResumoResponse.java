package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import com.nexo.app.modules.frota.domain.TipoAlertaAbastecimento;

import com.nexo.app.modules.frota.domain.OrigemAbastecimento;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Linha das filas e da lista de abastecimentos.
 *
 * @param itens      ex.: "Diesel S10 60 l, ARLA 32 20 l" (entregue, quando realizado)
 * @param avisoPosto situação do aviso ao posto (PENDENTE, ENVIADO) ou nulo antes da liberação
 */
public record AbastecimentoResumoResponse(
        UUID id,
        UUID idVeiculo,
        String placa,
        SituacaoAbastecimento situacao,
        String situacaoRotulo,
        OffsetDateTime solicitadoEm,
        String solicitante,
        String condutor,
        UUID idBaseOperacional,
        String baseNome,
        String posto,
        String itens,
        BigDecimal valorTotal,
        List<TipoAlertaAbastecimento> alertas,
        String avisoPosto,
        OffsetDateTime venceEm,
        String destino,
        OrigemAbastecimento origem,
        String origemRotulo
) {
}
