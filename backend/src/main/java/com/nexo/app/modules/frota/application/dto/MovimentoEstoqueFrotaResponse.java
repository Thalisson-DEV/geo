package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Movimentação do estoque da oficina com os nomes para a tela. */
public record MovimentoEstoqueFrotaResponse(
        UUID id,
        OffsetDateTime dataHora,
        String tipo,
        EstoqueFrotaApi.Motivo motivo,
        String motivoRotulo,
        UUID idEstoqueOrigem,
        String estoqueOrigem,
        UUID idEstoqueDestino,
        String estoqueDestino,
        UUID idMaterial,
        String codigo,
        String descricao,
        String unidade,
        BigDecimal quantidade,
        BigDecimal valorUnitario,
        BigDecimal valorTotal,
        String documento,
        String observacao,
        UUID idVeiculo,
        String placa,
        UUID idFornecedor,
        String fornecedor,
        UUID idOrdemServico,
        Long numeroOrdemServico,
        String usuario,
        boolean estornado
) {
}
