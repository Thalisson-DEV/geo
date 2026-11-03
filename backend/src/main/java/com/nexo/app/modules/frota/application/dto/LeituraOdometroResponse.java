package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.OrigemLeituraOdometro;
import com.nexo.app.modules.frota.domain.SituacaoLeituraOdometro;
import com.nexo.app.modules.frota.domain.TipoLeituraOdometro;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Leitura do livro-razão. {@code km} é o valor lido na {@code unidade} (km ou horas). */
public record LeituraOdometroResponse(
        UUID id,
        UUID idVeiculo,
        String placa,
        Long km,
        OffsetDateTime lidoEm,
        OrigemLeituraOdometro origem,
        UUID idOrigem,
        SituacaoLeituraOdometro situacao,
        String motivoSituacao,
        Long kmAnterior,
        String registradoPor,
        OffsetDateTime dataAnulacao,
        String justificativaAnulacao,
        UnidadeMedicao unidade,
        TipoLeituraOdometro tipo,
        /** Na troca de painel: último valor do painel antigo menos o inicial do novo. */
        Long deslocamento
) {
}
