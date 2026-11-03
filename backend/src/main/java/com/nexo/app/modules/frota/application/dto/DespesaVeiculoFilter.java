package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.FormaPagamentoDespesa;
import com.nexo.app.modules.frota.domain.SituacaoPagamentoDespesa;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Filtro das despesas por veículo.
 *
 * @param busca        trecho da placa
 * @param semPagamento só as a pagar que ainda não foram ao financeiro
 */
public record DespesaVeiculoFilter(
        UUID idVeiculo,
        String busca,
        List<UUID> idsBase,
        List<UUID> idsTipo,
        LocalDate de,
        LocalDate ate,
        FormaPagamentoDespesa formaPagamento,
        SituacaoPagamentoDespesa situacaoPagamento,
        Boolean semPagamento
) {
}
