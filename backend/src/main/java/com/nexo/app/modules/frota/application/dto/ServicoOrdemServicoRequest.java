package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Mão de obra da OS. Oficina interna: {@code idMecanico} (colaborador). Oficina externa:
 * {@code mecanicoNome} opcional.
 */
public record ServicoOrdemServicoRequest(
        @NotBlank(message = "Informe o serviço.") @Size(max = 300) String descricao,
        UUID idItemManutencao,
        UUID idMecanico,
        @Size(max = 120) String mecanicoNome,
        @NotNull(message = "Informe a quantidade.") @DecimalMin(value = "0.001", message = "A quantidade deve ser maior que zero.")
        @Digits(integer = 6, fraction = 3) BigDecimal quantidade,
        @NotNull(message = "Informe o valor unitário.") @DecimalMin("0") @Digits(integer = 10, fraction = 4) BigDecimal valorUnitario,
        /** Valor zero de propósito (garantia, cortesia): a OS não fica com valores pendentes por ele. */
        Boolean semCusto
) {
    public ServicoOrdemServicoRequest(String descricao, UUID idItemManutencao, UUID idMecanico, String mecanicoNome,
                                      BigDecimal quantidade, BigDecimal valorUnitario) {
        this(descricao, idItemManutencao, idMecanico, mecanicoNome, quantidade, valorUnitario, null);
    }
}
