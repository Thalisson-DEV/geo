package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.shared.application.SelecaoMultipla;

import java.util.List;

public record ItemManutencaoFilter(String busca, List<String> naturezas, Boolean ativo,
                                   com.nexo.app.modules.frota.domain.TipoItemManutencao tipo) {
    public ItemManutencaoFilter(String busca, List<String> naturezas, Boolean ativo) {
        this(busca, naturezas, ativo, null);
    }

    public ItemManutencaoFilter {
        naturezas = SelecaoMultipla.normalizar(naturezas);
    }
}
