package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Cadastro ou correção da apólice. {@code idsVeiculo} só vale no cadastro: os veículos entram
 * cobertos por toda a vigência (depois, use a inclusão de veículo com período).
 */
public record ApoliceRequest(
        @NotBlank(message = "Informe o número da apólice.") @Size(max = 60) String numero,
        @NotNull(message = "Escolha a seguradora.") UUID idSeguradora,
        UUID idCorretor,
        @Size(max = 150) String segurado,
        UUID idBaseOperacional,
        UUID idProcesso,
        @NotNull(message = "Informe o início da vigência.") LocalDate vigenciaInicio,
        @NotNull(message = "Informe o fim da vigência.") LocalDate vigenciaFim,
        @NotNull(message = "Informe o valor da apólice.") @PositiveOrZero BigDecimal valor,
        @PositiveOrZero BigDecimal franquia,
        @Size(max = 1000) String observacao,
        @Size(max = 500) List<@NotNull UUID> idsVeiculo
) {
}
