package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.OrigemPeca;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Peça ou consumível da OS. Com {@code idMaterial} (peça do catálogo da frota) e {@code idEstoque},
 * a peça sai do almoxarifado pelo custo médio: nome, código, unidade e valor vêm do estoque.
 */
public record PecaOrdemServicoRequest(
        @NotBlank(message = "Informe a peça.") @Size(max = 300) String descricao,
        @Size(max = 60) String codigo,
        @NotNull(message = "Informe se a peça veio do estoque ou de compra.") OrigemPeca origem,
        @NotNull(message = "Informe a quantidade.") @DecimalMin(value = "0.001", message = "A quantidade deve ser maior que zero.")
        @Digits(integer = 6, fraction = 3) BigDecimal quantidade,
        @NotBlank(message = "Informe a unidade (UN, L, KG...).") @Size(max = 10) String unidade,
        @DecimalMin("0") @Digits(integer = 10, fraction = 4) BigDecimal valorUnitario,
        UUID idMaterial,
        UUID idEstoque,
        /** Item de manutenção (tipo peça) de onde saiu o nome da peça comprada. */
        UUID idItemManutencao,
        /** Valor zero de propósito (garantia, cortesia): a OS não fica com valores pendentes por ela. */
        Boolean semCusto
) {
    public PecaOrdemServicoRequest(String descricao, String codigo, OrigemPeca origem, BigDecimal quantidade, String unidade,
                                   BigDecimal valorUnitario, UUID idMaterial, UUID idEstoque, UUID idItemManutencao) {
        this(descricao, codigo, origem, quantidade, unidade, valorUnitario, idMaterial, idEstoque, idItemManutencao, null);
    }

    public PecaOrdemServicoRequest(String descricao, String codigo, OrigemPeca origem, BigDecimal quantidade, String unidade,
                                   BigDecimal valorUnitario, UUID idMaterial, UUID idEstoque) {
        this(descricao, codigo, origem, quantidade, unidade, valorUnitario, idMaterial, idEstoque, null, null);
    }

    /** Sem a peça do estoque, mantém o construtor dos lançamentos livres. */
    public PecaOrdemServicoRequest(String descricao, String codigo, OrigemPeca origem, BigDecimal quantidade, String unidade,
                                   BigDecimal valorUnitario) {
        this(descricao, codigo, origem, quantidade, unidade, valorUnitario, null, null, null, null);
    }
}
