package com.nexo.app.modules.estoque.application.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * Decisão sobre uma série aplicada fora do saldo: {@code numSerieDoEstoque} é a série do
 * caminhão que era a aplicada (ela sai da equipe); vazio quando nenhuma corresponde.
 */
public record ConciliarSerieAplicadaRequest(
        @NotNull(message = "Informe a aplicação a conciliar.") UUID idMovimentacaoAplicacao,
        @Size(max = 100) String numSerieDoEstoque
) {
}
