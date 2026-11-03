package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.MotivoEncerramentoCobertura;
import com.nexo.app.modules.frota.domain.SituacaoPagamentoDespesa;
import com.nexo.app.modules.frota.domain.SituacaoVencimento;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Apólice com os veículos cobertos, as parcelas e os anexos.
 *
 * @param diasParaVencer  dias até o fim da vigência (negativo depois de vencida)
 * @param diasParaComecar dias até o início da vigência (zero ou negativo depois de começar)
 * @param veiculosHoje    veículos cobertos hoje
 * @param renovadaPor     apólice que continua a cobertura dos veículos depois do fim desta
 */
public record ApoliceResponse(
        UUID id,
        String numero,
        UUID idSeguradora,
        String seguradora,
        UUID idCorretor,
        String corretor,
        String segurado,
        UUID idBaseOperacional,
        String baseOperacional,
        UUID idProcesso,
        String processo,
        LocalDate vigenciaInicio,
        LocalDate vigenciaFim,
        BigDecimal valor,
        BigDecimal franquia,
        String observacao,
        SituacaoVencimento situacao,
        String situacaoRotulo,
        long diasParaVencer,
        long diasParaComecar,
        int veiculosHoje,
        Renovacao renovadaPor,
        List<Cobertura> veiculos,
        List<Parcela> parcelas,
        BigDecimal totalParcelas,
        List<Anexo> anexos,
        OffsetDateTime dataCriacao,
        String usuarioCriacao
) {
    public record Cobertura(UUID id, UUID idVeiculo, String placa, String modelo, LocalDate inicio, LocalDate fim, boolean cobertoHoje,
                            MotivoEncerramentoCobertura motivoEncerramento, String motivoEncerramentoRotulo,
                            String observacaoEncerramento) {
    }

    public record Renovacao(UUID id, String numero, LocalDate vigenciaInicio) {
    }

    public record Parcela(UUID id, int numero, LocalDate vencimento, BigDecimal valor, UUID idSolicitacaoFinanceira,
                          Long numeroSolicitacaoFinanceira, SituacaoPagamentoDespesa situacaoPagamento,
                          String situacaoPagamentoRotulo, String motivoReprovacaoPagamento, boolean podePedirPagamento,
                          boolean vencida, boolean pedirEmBreve) {
    }

    public record Anexo(UUID id, String nome, String contentType, Long tamanhoBytes, OffsetDateTime enviadoEm) {
    }
}
