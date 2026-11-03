package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.NaturezaServico;
import com.nexo.app.shared.application.SelecaoMultipla;

import java.util.List;

public record ItemManutencaoFilter(String busca, List<NaturezaServico> naturezas, Boolean ativo) {
    public ItemManutencaoFilter {
        naturezas = SelecaoMultipla.normalizar(naturezas);
    }
}
