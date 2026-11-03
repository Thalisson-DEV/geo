package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.FormaPagamentoDespesa;
import com.nexo.app.modules.frota.domain.OrigemDespesa;
import com.nexo.app.modules.frota.domain.SituacaoPagamentoDespesa;
import com.nexo.app.modules.frota.domain.TipoDocumentoFiscal;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Despesa como a tela mostra: veículo, tipo, valor, quem recebe, documento e a situação do pagamento. */
public record DespesaVeiculoResponse(
        UUID id,
        UUID idVeiculo,
        String placa,
        String veiculoDescricao,
        LocalDate data,
        UUID idTipo,
        String tipo,
        UUID idSubtipo,
        String subtipo,
        String descricao,
        BigDecimal valor,
        UUID idBaseOperacional,
        String baseNome,
        UUID idProcesso,
        String processoNome,
        UUID idFornecedor,
        String fornecedorNome,
        TipoDocumentoFiscal documentoTipo,
        String documentoTipoRotulo,
        String documentoNumero,
        BigDecimal medicao,
        FormaPagamentoDespesa formaPagamento,
        String formaPagamentoRotulo,
        UUID idSolicitacaoFinanceira,
        Long numeroSolicitacaoFinanceira,
        SituacaoPagamentoDespesa situacaoPagamento,
        String situacaoPagamentoRotulo,
        String motivoReprovacaoPagamento,
        boolean podePedirPagamento,
        OrigemDespesa origem,
        String idExterno,
        List<Anexo> anexos,
        OffsetDateTime criadaEm,
        String criadaPor
) {
    public record Anexo(UUID id, String nome, String contentType, Long tamanhoBytes, OffsetDateTime enviadoEm) {
    }
}
