package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.SituacaoVencimento;

import java.util.List;
import java.util.UUID;

/**
 * Filtro das apólices.
 *
 * @param busca     trecho do número ou do segurado
 * @param idVeiculo só as que cobrem (ou cobriram) o veículo
 * @param situacao  vigente, a vencer (dentro da maior faixa de aviso) ou vencida
 */
public record ApoliceFilter(
        String busca,
        List<UUID> idsSeguradora,
        UUID idVeiculo,
        List<UUID> idsBase,
        SituacaoVencimento situacao
) {
}
