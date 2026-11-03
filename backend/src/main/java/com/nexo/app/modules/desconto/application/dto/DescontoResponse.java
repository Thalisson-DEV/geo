package com.nexo.app.modules.desconto.application.dto;

import com.nexo.app.modules.desconto.domain.StatusDesconto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record DescontoResponse(
        UUID id,
        UUID colaboradorId,
        MotivoDescontoResponse motivo,
        String observacoes,
        Integer quantidadeParcelas,
        BigDecimal valorSugerido,
        BigDecimal valorValidado,
        BigDecimal valorBaixado,
        StatusDesconto status,
        UUID usuarioSolicitanteId,
        UUID usuarioValidadorId,
        UUID usuarioBaixaId,
        OffsetDateTime dataOcorrencia,
        OffsetDateTime dataCriacao,
        OffsetDateTime dataValidacao,
        OffsetDateTime dataBaixa,
        String motivoRejeicao,
        UUID usuarioRejeicaoId,
        OffsetDateTime dataRejeicao,
        UUID usuarioFinalizacaoId,
        OffsetDateTime dataFinalizacao,
        String usuarioUltimaAlteracao,
        OffsetDateTime dataUltimaAlteracao,
        List<DescontoItemResponse> itens,
        List<DescontoAnexoResponse> anexos,
        ResponsaveisDesconto responsaveis
) {

    /**
     * Nome de quem fez cada etapa, para o termo mostrar pessoas e não logins.
     * Só vem preenchido na consulta de um desconto; na listagem fica nulo.
     */
    public record ResponsaveisDesconto(String solicitante, String validador, String baixa, String rejeicao,
                                       String finalizacao) {}

    public DescontoResponse comResponsaveis(ResponsaveisDesconto nomes) {
        return new DescontoResponse(id, colaboradorId, motivo, observacoes, quantidadeParcelas, valorSugerido,
                valorValidado, valorBaixado, status, usuarioSolicitanteId, usuarioValidadorId, usuarioBaixaId,
                dataOcorrencia, dataCriacao, dataValidacao, dataBaixa, motivoRejeicao, usuarioRejeicaoId,
                dataRejeicao, usuarioFinalizacaoId, dataFinalizacao, usuarioUltimaAlteracao, dataUltimaAlteracao,
                itens, anexos, nomes);
    }
}
