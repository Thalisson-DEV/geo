package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoDocumentoFiscal;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Documento fiscal da OS. {@code fornecedor} é o nome do cadastro do financeiro ou o digitado. */
public record DocumentoFiscalOrdemServicoResponse(
        UUID id,
        TipoDocumentoFiscal tipo,
        String tipoRotulo,
        String numero,
        String serie,
        LocalDate emitidoEm,
        UUID idFornecedor,
        String fornecedor,
        BigDecimal valor,
        boolean possuiArquivo,
        String arquivoNome,
        String arquivoContentType,
        Long arquivoTamanhoBytes,
        OffsetDateTime registradoEm,
        String registradoPor
) {
}
