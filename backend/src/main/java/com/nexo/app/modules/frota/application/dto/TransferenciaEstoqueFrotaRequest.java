package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record TransferenciaEstoqueFrotaRequest(
        @NotNull(message = "Escolha o almoxarifado de origem.") UUID idOrigem,
        @NotNull(message = "Escolha o almoxarifado de destino.") UUID idDestino,
        @Size(max = 500) String observacao,
        @NotEmpty(message = "Inclua ao menos uma peça.") List<@Valid ItemSaidaEstoqueFrotaRequest> itens
) {
}
