package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Abastecimento avulso lançado na web por quem aprova a placa: já nasce aprovado, com a
 * quantidade de cada item. KM opcional; quando vem, passa pela trava.
 */
public record AbastecimentoAvulsoRequest(
        @NotNull(message = "Informe o veículo.") UUID idVeiculo,
        @NotNull(message = "Informe o condutor.") UUID idCondutor,
        @NotNull(message = "Informe o posto.") UUID idPosto,
        @NotBlank(message = "Informe o destino.") @Size(max = 200) String destino,
        @DecimalMin("0") BigDecimal medicao,
        @Size(max = 500) String observacao,
        @NotEmpty(message = "Informe ao menos um item.") @Size(max = 10) List<@Valid Item> itens
) {

    public record Item(@NotNull(message = "Informe o produto.") UUID idProduto,
                       @NotNull(message = "Informe a quantidade.") @DecimalMin("0") BigDecimal quantidade) {
    }
}
