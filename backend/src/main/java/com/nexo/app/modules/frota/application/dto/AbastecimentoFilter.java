package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.OrigemAbastecimento;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Filtro dos abastecimentos na web.
 *
 * @param fila      {@code APROVAR}: aguardando aprovação nas placas da carteira de quem consulta;
 *                  {@code LIBERAR}: aprovados à espera da liberação
 * @param busca     trecho da placa
 * @param comAlerta só os que têm (ou não têm) alerta
 */
public record AbastecimentoFilter(
        String fila,
        String busca,
        List<SituacaoAbastecimento> situacoes,
        List<UUID> idsBase,
        UUID idPosto,
        UUID idVeiculo,
        LocalDate de,
        LocalDate ate,
        Boolean comAlerta,
        /** Só os pedidos pelo app ou só os avulsos. */
        OrigemAbastecimento origem
) {
}
