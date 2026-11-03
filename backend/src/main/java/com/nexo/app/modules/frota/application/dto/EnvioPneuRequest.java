package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/** Envio de um pneu disponível ao reparo ou à reforma. */
public record EnvioPneuRequest(
        @NotNull(message = "Escolha reparo ou reforma.") DestinoPneu destino,
        UUID idFornecedor,
        @Size(max = 1000) String observacao
) {
    public enum DestinoPneu { REPARO, REFORMA }
}
