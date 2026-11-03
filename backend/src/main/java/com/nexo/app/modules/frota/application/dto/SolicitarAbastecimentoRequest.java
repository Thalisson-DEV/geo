package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Pedido de abastecimento feito pelo app. As fotos sobem depois, pelos ids. */
public record SolicitarAbastecimentoRequest(
        @NotNull(message = "O id do aparelho é obrigatório.") UUID idAparelho,
        @NotNull(message = "Informe o veículo.") UUID idVeiculo,
        @NotNull(message = "Informe o condutor.") UUID idCondutor,
        @NotNull(message = "Informe o posto.") UUID idPosto,
        @NotNull(message = "Informe o KM ou as horas do painel.") BigDecimal medicao,
        /** Para onde vai: a gestão define a quantidade por ele. */
        @NotBlank(message = "Informe o destino.") @Size(max = 200) String destino,
        @Size(max = 500) String observacao,
        @NotNull(message = "Informe quando foi pedido.") OffsetDateTime solicitadoEm,
        @NotEmpty(message = "Informe ao menos um item.") List<@Valid Item> itens,
        @NotNull(message = "Tire a foto do painel.") UUID idFotoPainel
) {

    /** A equipe pede só o produto; quem aprova define a quantidade. */
    public record Item(@NotNull UUID idProduto) {
    }
}
