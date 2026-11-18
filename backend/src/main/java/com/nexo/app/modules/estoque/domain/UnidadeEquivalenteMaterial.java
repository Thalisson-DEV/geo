package com.nexo.app.modules.estoque.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/**
 * Outra unidade em que o material pode ser informado. Guarda a frase como foi cadastrada
 * ("1 KG = 4,2 MT" ou "20 M = 1 UN"); o saldo continua sempre na unidade do material.
 */
@Entity
@Table(name = "materiais_unidades_equivalentes")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UnidadeEquivalenteMaterial extends BaseEntity {

    /** Escala do saldo e das movimentações. */
    public static final int ESCALA_SALDO = 3;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_material", nullable = false)
    private Material material;

    @Column(name = "unidade", nullable = false, length = 10)
    private String unidade;

    @Column(name = "quantidade_unidade", nullable = false, precision = 14, scale = 6)
    private BigDecimal quantidadeUnidade;

    @Column(name = "quantidade_base", nullable = false, precision = 14, scale = 6)
    private BigDecimal quantidadeBase;

    UnidadeEquivalenteMaterial(Material material, String unidade, BigDecimal quantidadeUnidade, BigDecimal quantidadeBase) {
        this.material = Objects.requireNonNull(material, "O material e obrigatorio");
        this.unidade = normalizar(unidade);
        redefinir(quantidadeUnidade, quantidadeBase);
    }

    void redefinir(BigDecimal quantidadeUnidade, BigDecimal quantidadeBase) {
        if (quantidadeUnidade == null || quantidadeUnidade.signum() <= 0
                || quantidadeBase == null || quantidadeBase.signum() <= 0) {
            throw new InvarianteVioladaException("Informe quantidades maiores que zero dos dois lados da equivalência.");
        }
        this.quantidadeUnidade = quantidadeUnidade.stripTrailingZeros();
        this.quantidadeBase = quantidadeBase.stripTrailingZeros();
    }

    /** Quantidade nesta unidade convertida para a unidade do material, na escala do saldo. */
    public BigDecimal paraUnidadeBase(BigDecimal quantidade) {
        return quantidade.multiply(quantidadeBase)
                .divide(quantidadeUnidade, ESCALA_SALDO, RoundingMode.HALF_UP);
    }

    public boolean mesmaUnidade(String outra) {
        return outra != null && unidade.equals(normalizar(outra));
    }

    static String normalizar(String unidade) {
        if (unidade == null || unidade.isBlank()) {
            throw new InvarianteVioladaException("Informe a unidade da equivalência.");
        }
        String limpa = unidade.trim().toUpperCase();
        if (limpa.length() > 10) {
            throw new InvarianteVioladaException("A unidade deve ter até 10 caracteres.");
        }
        return limpa;
    }
}
