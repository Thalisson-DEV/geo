package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.CausaManutencao;
import com.nexo.app.modules.frota.domain.TipoOficina;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Encerramento da OS. {@code inicioReal} nulo mantém o registrado ao iniciar;
 * {@code idsItem} nulo mantém os itens da abertura.
 */
public record ConcluirOrdemServicoRequest(
        OffsetDateTime inicioReal,
        @NotNull(message = "Informe o fim real do serviço.") OffsetDateTime fimReal,
        @NotBlank(message = "Descreva o serviço realizado.") @Size(max = 4000) String descricaoServico,
        @Size(max = 4000) String itensSubstituidos,
        @PositiveOrZero BigDecimal valorTotal,
        @PositiveOrZero Long kmEncerramento,
        TipoOficina tipoOficina,
        UUID idFornecedor,
        @Size(max = 150) String oficinaNome,
        @Size(max = 30) List<@NotNull UUID> idsItem,
        /** Obrigatória, exceto na importação. */
        CausaManutencao causa
) {
}
