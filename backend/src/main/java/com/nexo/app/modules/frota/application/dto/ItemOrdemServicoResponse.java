package com.nexo.app.modules.frota.application.dto;


import java.util.UUID;

/** Item tratado pela OS e, se houver, a repetição apontada para ele. */
public record ItemOrdemServicoResponse(
        UUID idItem,
        String nome,
        String natureza,
        String naturezaRotulo,
        RepeticaoManutencaoResponse repeticao
) {
}
