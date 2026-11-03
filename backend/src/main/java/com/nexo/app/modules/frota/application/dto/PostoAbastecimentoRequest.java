package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record PostoAbastecimentoRequest(
        @NotBlank(message = "Informe o nome do posto.") @Size(max = 120) String nome,
        @Size(max = 20) String cnpj,
        UUID idBaseOperacional,
        @Size(max = 25) String whatsapp,
        UUID idFornecedor,
        @Size(max = 500) String observacao
) {
}
