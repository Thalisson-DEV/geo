package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.CausaManutencao;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * Problema resolvido na hora (ex.: lâmpada trocada pelo condutor). Abre e conclui a OS no mesmo
 * passo, com o que foi feito e quem fez: um colaborador ({@code idExecutor}, oficina interna) ou
 * um nome livre ({@code executorNome}, oficina externa). Causa vazia = serviço corretivo.
 */
public record ResolverPendenciasRequest(
        @NotEmpty(message = "Escolha ao menos uma pendência.") @Size(max = 30) List<@NotNull UUID> idsPendencia,
        @NotEmpty(message = "Informe ao menos um item de manutenção.") @Size(max = 30) List<@NotNull UUID> idsItem,
        @NotBlank(message = "Descreva o que foi feito.") @Size(max = 1000) String descricaoServico,
        UUID idExecutor,
        @Size(max = 120) String executorNome,
        UUID idBaseOperacional,
        CausaManutencao causa
) {
}
