package com.nexo.app.modules.frota.application.dto;

import java.util.UUID;

public record PostoAbastecimentoResponse(
        UUID id,
        String nome,
        String cnpj,
        UUID idBaseOperacional,
        String baseNome,
        String whatsapp,
        UUID idFornecedor,
        String fornecedorNome,
        String observacao,
        boolean ativo
) {
}
