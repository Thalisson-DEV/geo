package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Entrada de peças com custo (compra com NF, devolução, saldo inicial). Sem data, agora. */
public record EntradaEstoqueFrotaRequest(
        @NotNull(message = "Escolha o almoxarifado.") UUID idEstoque,
        EstoqueFrotaApi.Motivo motivo,
        @Size(max = 60) String documento,
        UUID idFornecedor,
        @Size(max = 500) String observacao,
        OffsetDateTime dataHora,
        @NotEmpty(message = "Inclua ao menos uma peça.") List<@Valid ItemEntradaEstoqueFrotaRequest> itens
) {
}
