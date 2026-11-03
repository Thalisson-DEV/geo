package com.nexo.app.modules.frota.application.dto;

import java.util.UUID;

/** Prévia, na tela de abertura, de um item que já foi feito recentemente na placa. */
public record PreviaRepeticaoResponse(
        UUID idItem,
        String nome,
        RepeticaoManutencaoResponse repeticao
) {
}
