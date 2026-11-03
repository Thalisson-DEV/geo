package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Movimentação de pneus de um veículo, gravada de uma vez (o "salvar" da tela de arrastar e
 * soltar). Cada destino diz onde o pneu termina.
 *
 * @param km          valor do painel na movimentação; sem ele, vale a medição atual do veículo
 * @param realizadaEm sem data, agora
 */
public record MovimentacaoPneusRequest(
        @NotNull(message = "Escolha o veículo.") UUID idVeiculo,
        OffsetDateTime realizadaEm,
        @Min(0) Long km,
        @Size(max = 1000) String observacao,
        @NotEmpty(message = "Nenhuma mudança para salvar.") List<@Valid Destino> destinos
) {
    /**
     * @param posicao     com destino POSICAO
     * @param idEstoque   com destino ESTOQUE
     * @param idFornecedor com REPARO ou REFORMA (opcional)
     * @param motivo      com DESCARTE
     */
    public record Destino(
            @NotNull UUID idPneu,
            @NotNull(message = "Informe o destino do pneu.") TipoDestino destino,
            @Size(max = 5) String posicao,
            UUID idEstoque,
            UUID idFornecedor,
            @Size(max = 300) String motivo
    ) {
    }

    public enum TipoDestino { POSICAO, ESTOQUE, REPARO, REFORMA, DESCARTE }
}
