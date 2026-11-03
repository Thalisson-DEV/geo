package com.nexo.app.modules.estoque.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/**
 * Representa o saldo quantitativo de um material em um estoque específico.
 */
@Entity
@Table(name = "saldos", uniqueConstraints = {
    @UniqueConstraint(name = "unq_estoque_material_condicao", columnNames = {"id_estoque", "id_material", "condicao"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Saldo extends BaseEntity {

    @NotNull(message = "O estoque é obrigatório")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_estoque", nullable = false)
    private Estoque estoque;

    @NotNull(message = "O material é obrigatório")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_material", nullable = false)
    private Material material;

    @NotNull(message = "A condição do material é obrigatória")
    @Enumerated(EnumType.STRING)
    @Column(name = "condicao", nullable = false, length = 20)
    private CondicaoMaterial condicao;

    @Column(name = "quantidade", nullable = false, precision = 12, scale = 3)
    private BigDecimal quantidade = BigDecimal.ZERO;

    /** Custo médio ponderado; nulo nos estoques sem custo (operacionais). */
    @Column(name = "custo_medio", precision = 14, scale = 4)
    private BigDecimal custoMedio;

    public Saldo(Estoque estoque, Material material, CondicaoMaterial condicao) {
        validarVinculos(estoque, material, condicao);
        this.estoque = estoque;
        this.material = material;
        this.condicao = condicao != null ? condicao : CondicaoMaterial.NOVO;
        this.quantidade = BigDecimal.ZERO;
    }

    /**
     * Incrementa o saldo.
     */
    public void adicionarQuantidade(BigDecimal qtd) {
        validarStatus();
        if (qtd == null || qtd.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("A quantidade a ser adicionada deve ser positiva.");
        }
        this.quantidade = this.quantidade.add(qtd);
    }

    /**
     * Decrementa o saldo quantitativo; divergências negativas são permitidas e sinalizadas.
     */
    public void removerQuantidade(BigDecimal qtd) {
        validarStatus();
        if (qtd == null || qtd.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("A quantidade a ser removida deve ser positiva.");
        }
        this.quantidade = this.quantidade.subtract(qtd);
    }

    /**
     * Entrada com custo: soma a quantidade e recalcula a média ponderada. Com saldo zerado ou
     * negativo, a média passa a ser o valor da entrada.
     */
    public void adicionarComCusto(BigDecimal qtd, BigDecimal valorUnitario) {
        if (valorUnitario == null || valorUnitario.signum() < 0) {
            throw new InvarianteVioladaException("Informe o valor unitário da entrada.");
        }
        BigDecimal anterior = this.quantidade;
        adicionarQuantidade(qtd);
        if (anterior.signum() <= 0 || custoMedio == null) {
            this.custoMedio = valorUnitario.setScale(4, RoundingMode.HALF_UP);
        } else {
            this.custoMedio = anterior.multiply(custoMedio).add(qtd.multiply(valorUnitario))
                    .divide(this.quantidade, 4, RoundingMode.HALF_UP);
        }
    }

    /** Saída sem deixar o saldo negativo (estoques com custo controlam a quantidade de verdade). */
    public void removerSemNegativar(BigDecimal qtd) {
        if (qtd != null && quantidade.compareTo(qtd) < 0) {
            throw new InvarianteVioladaException("Saldo insuficiente de " + material.getDescricao() + ": há "
                    + quantidade.stripTrailingZeros().toPlainString() + " " + Objects.toString(material.getUnidadeMedida(), "")
                    + " no " + estoque.getNomeIdentificador() + ".");
        }
        removerQuantidade(qtd);
    }

    public BigDecimal custoMedioOuZero() {
        return custoMedio == null ? BigDecimal.ZERO : custoMedio;
    }

    public boolean isNegativo() {
        return quantidade != null && quantidade.signum() < 0;
    }

    private void validarVinculos(Estoque estoque, Material material, CondicaoMaterial condicao) {
        if (estoque == null || material == null || condicao == null) {
            throw new IllegalArgumentException("Estoque, Material e Condição são obrigatórios para compor um saldo.");
        }
        if (!estoque.isAtivo()) {
            throw new InvarianteVioladaException("Não é possível criar saldo para um estoque desativado.");
        }
        if (!material.isAtivo()) {
            throw new InvarianteVioladaException("Não é possível criar saldo para um material desativado.");
        }
    }

    private void validarStatus() {
        if (!isAtivo()) {
            throw new IllegalStateException("Não é possível movimentar o saldo de um registro desativado.");
        }
    }
}
