package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/** Saída avulsa (sem OS): para um veículo, uso na oficina, perda ou venda. */
public record SaidaEstoqueFrotaRequest(
        @NotNull(message = "Escolha o almoxarifado.") UUID idEstoque,
        @NotNull(message = "Escolha o motivo da saída.") EstoqueFrotaApi.Motivo motivo,
        UUID idVeiculo,
        @Size(max = 500) String observacao,
        @NotEmpty(message = "Inclua ao menos uma peça.") List<@Valid ItemSaidaEstoqueFrotaRequest> itens
) {
}
