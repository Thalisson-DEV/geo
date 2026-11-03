package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.NaturezaServico;

import java.util.UUID;

public record ItemManutencaoResponse(
        UUID id,
        String nome,
        NaturezaServico natureza,
        String naturezaRotulo,
        String descricao,
        Integer diasRepeticao,
        boolean ativo
) {
}
