package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.PapelSeguradora;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record SeguradoraFrotaRequest(
        @NotNull(message = "Escolha o fornecedor do financeiro.") UUID idFornecedor,
        @NotNull(message = "Informe se é seguradora ou corretora.") PapelSeguradora papel,
        @Size(max = 25) String telefoneAssistencia,
        @Size(max = 500) String observacao
) {
}
