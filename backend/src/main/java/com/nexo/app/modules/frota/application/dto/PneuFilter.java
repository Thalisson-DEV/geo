package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.SituacaoPneu;

import java.util.List;
import java.util.UUID;

/**
 * @param busca      marca de fogo, série, marca, modelo ou placa
 * @param sulcoBaixo só os pneus no sulco mínimo ou abaixo
 */
public record PneuFilter(
        String busca,
        List<SituacaoPneu> situacoes,
        UUID idVeiculo,
        UUID idEstoque,
        String marca,
        Boolean sulcoBaixo
) {
}
