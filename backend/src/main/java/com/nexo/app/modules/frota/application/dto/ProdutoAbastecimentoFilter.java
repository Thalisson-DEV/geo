package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.CategoriaProdutoAbastecimento;

public record ProdutoAbastecimentoFilter(String busca, Boolean ativo, CategoriaProdutoAbastecimento categoria) {
}
