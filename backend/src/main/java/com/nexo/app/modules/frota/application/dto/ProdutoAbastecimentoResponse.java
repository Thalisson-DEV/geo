package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.CategoriaProdutoAbastecimento;
import com.nexo.app.modules.frota.domain.Combustivel;
import com.nexo.app.modules.frota.domain.UnidadeProdutoAbastecimento;

import java.util.UUID;

public record ProdutoAbastecimentoResponse(
        UUID id,
        String nome,
        CategoriaProdutoAbastecimento categoria,
        UnidadeProdutoAbastecimento unidade,
        Combustivel combustivel,
        boolean ativo
) {
}
