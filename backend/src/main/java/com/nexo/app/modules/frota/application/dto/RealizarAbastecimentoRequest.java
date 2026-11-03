package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * O que o posto entregou. Para cada item da solicitação: o produto (vazio mantém o pedido),
 * a quantidade (zero se não veio) e, no combustível, se completou o tanque. O valor sai do
 * preço do posto; só vai digitado quando o posto não tem preço do produto.
 */
public record RealizarAbastecimentoRequest(
        @NotNull(message = "Informe o KM ou as horas do painel.") BigDecimal medicao,
        @NotNull(message = "Informe quando abasteceu.") OffsetDateTime realizadoEm,
        @NotEmpty(message = "Informe o que foi entregue.") List<@Valid Item> itens,
        @NotNull(message = "Tire a foto do painel depois do abastecimento.") UUID idFotoPainel,
        @NotNull(message = "Tire a foto do cupom ou da nota.") UUID idFotoCupom
) {

    public record Item(@NotNull UUID idItem, UUID idProduto, @NotNull BigDecimal quantidade, BigDecimal valorTotal,
                       Boolean tanqueCheio) {
    }
}
