package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoOficina;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Completa a OS concluída com valores pendentes: causa, serviço realizado, oficina e valor (este
 * só vale sem lançamentos na execução). {@code idsItem} nulo mantém os itens da OS.
 */
public record BaixaOrdemServicoRequest(
        @NotBlank(message = "Escolha a causa da manutenção.") String causa,
        @NotBlank(message = "Descreva o serviço realizado.") @Size(max = 4000) String descricaoServico,
        @Size(max = 4000) String itensSubstituidos,
        @PositiveOrZero BigDecimal valorTotal,
        TipoOficina tipoOficina,
        UUID idFornecedor,
        @Size(max = 150) String oficinaNome,
        @Size(max = 30) List<@NotNull UUID> idsItem
) {
}
