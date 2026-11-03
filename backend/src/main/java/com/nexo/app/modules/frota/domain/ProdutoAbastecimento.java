package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.EnumSet;
import java.util.Set;

/**
 * Produto que o posto entrega (combustível, ARLA, óleo, fluido). O combustível ligado ao
 * produto sugere o preferido de cada veículo pela ficha.
 */
@Entity
@Table(name = "frota_produtos_abastecimento")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProdutoAbastecimento extends BaseEntity {

    private static final Set<Combustivel> COMBUSTIVEIS_DE_POSTO =
            EnumSet.of(Combustivel.DIESEL_S10, Combustivel.DIESEL_S500, Combustivel.GASOLINA, Combustivel.ETANOL, Combustivel.GNV);

    @Column(name = "nome", nullable = false, length = 80)
    private String nome;

    @Enumerated(EnumType.STRING)
    @Column(name = "categoria", nullable = false, length = 20)
    private CategoriaProdutoAbastecimento categoria;

    @Enumerated(EnumType.STRING)
    @Column(name = "unidade", nullable = false, length = 5)
    private UnidadeProdutoAbastecimento unidade;

    @Enumerated(EnumType.STRING)
    @Column(name = "combustivel", length = 20)
    private Combustivel combustivel;

    public record Dados(String nome, CategoriaProdutoAbastecimento categoria, UnidadeProdutoAbastecimento unidade,
                        Combustivel combustivel) {
    }

    public ProdutoAbastecimento(Dados dados) {
        preencher(dados);
    }

    public void atualizar(Dados dados) {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Não é possível alterar um produto desativado.");
        }
        preencher(dados);
    }

    /** O produto serve ao combustível da ficha (flex aceita gasolina e etanol). */
    public boolean atende(Combustivel daFicha) {
        if (combustivel == null || daFicha == null) {
            return false;
        }
        return daFicha == Combustivel.FLEX
                ? combustivel == Combustivel.GASOLINA || combustivel == Combustivel.ETANOL
                : combustivel == daFicha;
    }

    public boolean isCombustivel() {
        return categoria == CategoriaProdutoAbastecimento.COMBUSTIVEL;
    }

    private void preencher(Dados dados) {
        if (dados.categoria() == null) {
            throw new InvarianteVioladaException("Informe a categoria do produto.");
        }
        if (dados.unidade() == null) {
            throw new InvarianteVioladaException("Informe a unidade do produto.");
        }
        if (dados.combustivel() != null) {
            if (dados.categoria() != CategoriaProdutoAbastecimento.COMBUSTIVEL) {
                throw new InvarianteVioladaException("Só produtos da categoria combustível se ligam ao combustível do veículo.");
            }
            if (!COMBUSTIVEIS_DE_POSTO.contains(dados.combustivel())) {
                throw new InvarianteVioladaException(
                        "O combustível " + dados.combustivel().getRotulo() + " não é vendido como produto de posto.");
            }
        }
        this.nome = Textos.obrigatorio(dados.nome(), "nome do produto", 80);
        this.categoria = dados.categoria();
        this.unidade = dados.unidade();
        this.combustivel = dados.combustivel();
    }
}
