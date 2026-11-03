package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.FrotaOdometroApi;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Diagrama do veículo com o pneu de cada posição, a medição atual e a última inspeção.
 *
 * @param eixos     nulo enquanto o diagrama não foi definido
 * @param kmAtual   valor do painel hoje (nulo sem leitura)
 */
public record VeiculoPneusResponse(
        UUID idVeiculo,
        String placa,
        String tipoVeiculo,
        String eixos,
        int estepes,
        Long kmAtual,
        FrotaOdometroApi.Unidade unidade,
        BigDecimal sulcoMinimoMm,
        OffsetDateTime ultimaInspecaoEm,
        List<Posicao> posicoes
) {
    public record Posicao(String codigo, int eixo, String rotulo, boolean estepe, PneuResponse pneu) {
    }
}
