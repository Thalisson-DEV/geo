package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotEmpty;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

/**
 * Aprovação com a quantidade de cada item (id do item → quantidade). Zero tira o item do
 * abastecimento; ao menos um precisa ficar.
 */
public record AprovarAbastecimentoRequest(
        @NotEmpty(message = "Informe a quantidade de cada item.") Map<UUID, BigDecimal> quantidades
) {
}
