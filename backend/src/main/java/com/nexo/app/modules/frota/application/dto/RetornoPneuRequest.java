package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Volta do reparo ou da reforma para um almoxarifado, com o custo do serviço. Na reforma, o sulco é obrigatório. */
public record RetornoPneuRequest(
        @NotNull(message = "Escolha o almoxarifado que recebe o pneu.") UUID idEstoque,
        @DecimalMin("0") @Digits(integer = 10, fraction = 2) BigDecimal valor,
        UUID idFornecedor,
        @Size(max = 60) String documento,
        @DecimalMin("0") @DecimalMax("40") @Digits(integer = 2, fraction = 1) BigDecimal sulcoMm,
        OffsetDateTime ocorridoEm,
        @Size(max = 1000) String observacao
) {
}
