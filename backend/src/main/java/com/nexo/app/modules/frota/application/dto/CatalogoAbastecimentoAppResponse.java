package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.CategoriaProdutoAbastecimento;
import com.nexo.app.modules.frota.domain.UnidadeProdutoAbastecimento;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * O que o app guarda para pedir abastecimento sem sinal. Veículos, condutores e CNH vêm do
 * catálogo do checklist, que o app já sincroniza.
 *
 * @param preferidos combustível sugerido para cada veículo pela ficha (flex sugere a gasolina)
 */
public record CatalogoAbastecimentoAppResponse(
        OffsetDateTime geradoEm,
        List<Posto> postos,
        List<Produto> produtos,
        List<Preferido> preferidos
) {

    /** @param precos preço vigente hoje por produto: o realizado calcula o valor por ele */
    public record Posto(UUID id, String nome, UUID idBaseOperacional, String baseNome, List<Preco> precos) {
    }

    public record Preco(UUID idProduto, java.math.BigDecimal precoUnitario) {
    }

    public record Produto(UUID id, String nome, CategoriaProdutoAbastecimento categoria, UnidadeProdutoAbastecimento unidade) {
    }

    public record Preferido(UUID idVeiculo, UUID idProduto) {
    }
}
