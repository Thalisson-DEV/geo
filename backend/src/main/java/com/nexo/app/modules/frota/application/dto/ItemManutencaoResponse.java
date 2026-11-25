package com.nexo.app.modules.frota.application.dto;


import java.util.UUID;

public record ItemManutencaoResponse(
        UUID id,
        String nome,
        String natureza,
        String naturezaRotulo,
        String descricao,
        Integer diasRepeticao,
        com.nexo.app.modules.frota.domain.TipoItemManutencao tipo,
        String tipoRotulo,
        boolean ativo
) {
}
