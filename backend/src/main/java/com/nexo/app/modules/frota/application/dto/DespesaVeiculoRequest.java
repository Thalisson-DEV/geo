package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.FormaPagamentoDespesa;
import com.nexo.app.modules.frota.domain.TipoDocumentoFiscal;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Despesa lançada na tela. Sem base, vale a base atual do veículo; sem forma de pagamento,
 * vai ao financeiro ("a pagar").
 */
public record DespesaVeiculoRequest(
        @NotNull(message = "Informe o veículo.") UUID idVeiculo,
        @NotNull(message = "Informe a data.") LocalDate data,
        @NotNull(message = "Escolha o tipo.") UUID idTipo,
        UUID idSubtipo,
        @Size(max = 500) String descricao,
        @NotNull(message = "Informe o valor.") @Positive(message = "O valor deve ser maior que zero.") BigDecimal valor,
        UUID idBaseOperacional,
        UUID idProcesso,
        UUID idFornecedor,
        @Size(max = 150) String fornecedorNome,
        TipoDocumentoFiscal documentoTipo,
        @Size(max = 60) String documentoNumero,
        BigDecimal medicao,
        FormaPagamentoDespesa formaPagamento
) {
}
