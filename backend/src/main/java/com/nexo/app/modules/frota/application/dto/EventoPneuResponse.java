package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoEventoPneu;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record EventoPneuResponse(
        UUID id,
        UUID idPneu,
        String marcaFogo,
        TipoEventoPneu tipo,
        String tipoRotulo,
        OffsetDateTime ocorridoEm,
        UUID idVeiculo,
        String placa,
        String posicaoOrigem,
        String posicaoOrigemRotulo,
        String posicaoDestino,
        String posicaoDestinoRotulo,
        Integer kmVeiculo,
        Integer kmRodado,
        int vida,
        BigDecimal sulcoMm,
        Integer pressaoPsi,
        BigDecimal valor,
        String fornecedor,
        String documento,
        String descricao,
        String observacao,
        String usuario
) {
}
