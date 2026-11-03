package com.nexo.app.modules.frota.application.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** @param alertas quantos pneus com pressão fora da faixa ou sulco no mínimo */
public record InspecaoPneuResponse(
        UUID id,
        UUID idVeiculo,
        String placa,
        OffsetDateTime realizadaEm,
        Integer km,
        UUID idResponsavel,
        String responsavel,
        String observacao,
        String registradoPor,
        int alertas,
        List<Item> itens
) {
    public record Item(UUID idPneu, String marcaFogo, String posicao, String posicaoRotulo, Integer pressaoPsi,
                       Integer pressaoRecomendadaPsi, boolean pressaoFora, BigDecimal sulcoMm, boolean sulcoBaixo,
                       String observacao) {
    }
}
