package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.RegimeVeiculo;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.shared.application.SelecaoMultipla;

import java.util.List;
import java.util.UUID;

/** Filtro da listagem de veículos da frota. {@code busca} procura em placa, chassi e renavam. */
public record FichaVeiculoFilter(
        String busca,
        List<UUID> idsBase,
        List<UUID> idsTipoVeiculo,
        List<SituacaoOperacional> situacoes,
        RegimeVeiculo regime,
        Boolean ativo,
        /* Pela telemetria, nos últimos 30 dias: só os que rodaram fora do expediente. */
        Boolean foraExpediente,
        /* Pela telemetria, nos últimos 30 dias: só os que rodam menos de 20 km por dia útil. */
        Boolean rodaPouco
) {
    public FichaVeiculoFilter(String busca, List<UUID> idsBase, List<UUID> idsTipoVeiculo, List<SituacaoOperacional> situacoes,
                              RegimeVeiculo regime, Boolean ativo) {
        this(busca, idsBase, idsTipoVeiculo, situacoes, regime, ativo, null, null);
    }

    public boolean filtraUso() {
        return Boolean.TRUE.equals(foraExpediente) || Boolean.TRUE.equals(rodaPouco);
    }

    public FichaVeiculoFilter {
        idsBase = SelecaoMultipla.normalizar(idsBase);
        idsTipoVeiculo = SelecaoMultipla.normalizar(idsTipoVeiculo);
        situacoes = SelecaoMultipla.normalizar(situacoes);
    }
}
