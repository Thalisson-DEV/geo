package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.SituacaoPneu;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * @param kmVida    km da vida atual, contando o trecho montado agora
 * @param kmTotal   km de todas as vidas, contando o trecho montado agora
 * @param custoTotal compra mais reparos e reformas
 * @param custoPorKm custo total dividido pelo km total (nulo sem km)
 * @param alertas   SULCO_BAIXO, SULCO_ATENCAO, SERVICO_ATRASADO, PRESSAO_FORA
 */
public record PneuResponse(
        UUID id,
        Long numero,
        String marcaFogo,
        String numeroSerie,
        String marca,
        String modelo,
        String medida,
        Integer largura,
        Integer perfil,
        String aro,
        boolean radial,
        boolean comCamara,
        String indiceCarga,
        String indiceVelocidade,
        Integer lonas,
        String dot,
        UUID idFornecedor,
        String fornecedor,
        String notaFiscal,
        LocalDate dataCompra,
        BigDecimal valorCompra,
        BigDecimal sulcoInicialMm,
        BigDecimal sulcoAtualMm,
        Integer pressaoRecomendadaPsi,
        Integer ultimaPressaoPsi,
        int vida,
        int kmVida,
        int kmTotal,
        SituacaoPneu situacao,
        String situacaoRotulo,
        UUID idEstoque,
        String estoque,
        UUID idVeiculo,
        String placa,
        String posicao,
        String posicaoRotulo,
        OffsetDateTime montadoEm,
        UUID idFornecedorServico,
        String fornecedorServico,
        OffsetDateTime enviadoEm,
        OffsetDateTime descartadoEm,
        String motivoDescarte,
        String observacao,
        BigDecimal custoTotal,
        BigDecimal custoPorKm,
        List<String> alertas
) {
}
