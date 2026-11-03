package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoDocumentoFiscal;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** Documento fiscal da OS. Fornecedor pelo cadastro do financeiro ({@code idFornecedor}) ou pelo nome. */
public record DocumentoFiscalOrdemServicoRequest(
        @NotNull(message = "Informe o tipo do documento.") TipoDocumentoFiscal tipo,
        @NotBlank(message = "Informe o número do documento.") @Size(max = 60) String numero,
        @Size(max = 10) String serie,
        @NotNull(message = "Informe a data de emissão.") @PastOrPresent(message = "A emissão não pode estar no futuro.") LocalDate emitidoEm,
        UUID idFornecedor,
        @Size(max = 150) String fornecedorNome,
        @NotNull(message = "Informe o valor do documento.") @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal valor
) {
}
