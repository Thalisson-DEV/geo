package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoSinistro;
import com.nexo.app.modules.frota.domain.TipoSinistro;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Sinistro com a seguradora acionada e a OS de reparo.
 *
 * @param podeFinalizar em andamento e sem OS aberta
 */
public record SinistroResponse(
        UUID id,
        Long numero,
        UUID idVeiculo,
        String placa,
        String modelo,
        UUID idBaseOperacional,
        String baseOperacional,
        OffsetDateTime ocorridoEm,
        String local,
        TipoSinistro tipo,
        String tipoRotulo,
        UUID idCondutor,
        String condutor,
        Boolean culpaCondutor,
        String descricao,
        String terceiros,
        String boletimOcorrencia,
        Seguradora seguradora,
        BigDecimal franquiaPaga,
        Reparo reparo,
        SituacaoSinistro situacao,
        String situacaoRotulo,
        boolean podeFinalizar,
        OffsetDateTime finalizadoEm,
        OffsetDateTime canceladoEm,
        String motivoCancelamento,
        List<ApoliceResponse.Anexo> anexos,
        OffsetDateTime dataCriacao,
        String usuarioCriacao
) {
    /** Apólice acionada; nula enquanto a seguradora não foi acionada. */
    public record Seguradora(UUID idApolice, String numeroApolice, String seguradora, BigDecimal franquiaApolice,
                             String numeroSinistro, OffsetDateTime acionadaEm) {
    }

    /** OS de reparo aberta pelo sinistro. */
    public record Reparo(UUID idOrdemServico, Long numero, SituacaoOrdemServico situacao, String situacaoRotulo,
                         boolean aberta, boolean veiculoParado, OffsetDateTime fimReal) {
    }
}
