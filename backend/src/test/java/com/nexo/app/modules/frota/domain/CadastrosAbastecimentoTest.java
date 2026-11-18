package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CadastrosAbastecimentoTest {

    @Test
    void postoNormalizaWhatsappECnpj() {
        var posto = new PostoAbastecimento(new PostoAbastecimento.Dados(" Posto Central ", "12.345.678/0001-90", null,
                "(74) 99999-0000", null, null));
        assertThat(posto.getNome()).isEqualTo("Posto Central");
        assertThat(posto.getCnpj()).isEqualTo("12345678000190");
        assertThat(posto.getWhatsapp()).as("sem DDI vira Brasil").isEqualTo("5574999990000");
        assertThat(PostoAbastecimento.whatsapp("+55 74 3611-0000")).isEqualTo("557436110000");
        assertThat(PostoAbastecimento.whatsapp("  ")).isNull();
    }

    @Test
    void postoRecusaWhatsappECnpjIncompletos() {
        assertThatThrownBy(() -> PostoAbastecimento.whatsapp("99999-0000"))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("DDD");
        assertThatThrownBy(() -> new PostoAbastecimento(new PostoAbastecimento.Dados("Posto", "123", null, null, null, null)))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("14 dígitos");
    }

    @Test
    void produtoAtendeOCombustivelDaFicha() {
        var gasolina = produto(CategoriaProdutoAbastecimento.COMBUSTIVEL, Combustivel.GASOLINA);
        var etanol = produto(CategoriaProdutoAbastecimento.COMBUSTIVEL, Combustivel.ETANOL);
        var s10 = produto(CategoriaProdutoAbastecimento.COMBUSTIVEL, Combustivel.DIESEL_S10);

        assertThat(gasolina.atende(Combustivel.FLEX)).isTrue();
        assertThat(etanol.atende(Combustivel.FLEX)).isTrue();
        assertThat(s10.atende(Combustivel.FLEX)).isFalse();
        assertThat(s10.atende(Combustivel.DIESEL_S10)).isTrue();
        assertThat(s10.atende(null)).isFalse();
        assertThat(produto(CategoriaProdutoAbastecimento.ARLA, null).atende(Combustivel.DIESEL_S10)).isFalse();
    }

    @Test
    void produtoSoLigaCombustivelDePostoNaCategoriaCombustivel() {
        assertThatThrownBy(() -> produto(CategoriaProdutoAbastecimento.ARLA, Combustivel.DIESEL_S10))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("categoria combustível");
        assertThatThrownBy(() -> produto(CategoriaProdutoAbastecimento.COMBUSTIVEL, Combustivel.ELETRICO))
                .isInstanceOf(InvarianteVioladaException.class).hasMessageContaining("Elétrico");
    }

    @Test
    void carteiraGuardaPlacasUmaAUma() {
        var carteira = new CarteiraAprovacao(UUID.randomUUID());
        var a = UUID.randomUUID();
        var b = UUID.randomUUID();
        assertThat(carteira.incluirPlacas(List.of(a, b))).isEqualTo(2);
        assertThat(carteira.incluirPlacas(List.of(a))).as("repetida não conta").isZero();
        assertThat(carteira.aprova(a)).isTrue();

        carteira.definirPlacas(List.of(b));
        assertThat(carteira.aprova(a)).isFalse();
        assertThat(carteira.aprova(b)).isTrue();

        carteira.desativar();
        assertThat(carteira.aprova(b)).as("carteira desativada não aprova").isFalse();
    }

    private static ProdutoAbastecimento produto(CategoriaProdutoAbastecimento categoria, Combustivel combustivel) {
        return new ProdutoAbastecimento(new ProdutoAbastecimento.Dados("Produto", categoria, UnidadeProdutoAbastecimento.L, combustivel));
    }
}
