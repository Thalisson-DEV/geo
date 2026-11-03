package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.CategoriaProdutoAbastecimento;
import com.nexo.app.modules.frota.domain.Combustivel;
import com.nexo.app.modules.frota.domain.UnidadeProdutoAbastecimento;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProdutoAbastecimentoRequest(
        @NotBlank(message = "Informe o nome do produto.") @Size(max = 80) String nome,
        @NotNull(message = "Informe a categoria do produto.") CategoriaProdutoAbastecimento categoria,
        @NotNull(message = "Informe a unidade do produto.") UnidadeProdutoAbastecimento unidade,
        Combustivel combustivel
) {
}
