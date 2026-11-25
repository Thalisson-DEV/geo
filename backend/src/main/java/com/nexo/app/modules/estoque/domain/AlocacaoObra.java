package com.nexo.app.modules.estoque.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;

/**
 * Parte do saldo de um local (caminhão, canteiro) que é de uma obra: o material "carimbado" para ela. O saldo físico
 * continua em {@link Saldo}; o que não está alocado a nenhuma obra é livre. Nunca fica negativa: quem baixa mais do
 * que há alocado usa o livre ou o de outra obra, e isso vira rastro nas movimentações.
 */
@Entity
@Table(name = "alocacoes_obra_estoque", uniqueConstraints = {
        @UniqueConstraint(name = "uk_alocacoes_obra_chave", columnNames = {"id_estoque", "id_material", "condicao", "id_obra"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AlocacaoObra extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_estoque", nullable = false)
    private Estoque estoque;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_material", nullable = false)
    private Material material;

    @Enumerated(EnumType.STRING)
    @Column(name = "condicao", nullable = false, length = 20)
    private CondicaoMaterial condicao;

    @Column(name = "id_obra", nullable = false)
    private UUID idObra;

    @Column(name = "quantidade", nullable = false, precision = 12, scale = 3)
    private BigDecimal quantidade = BigDecimal.ZERO;

    public AlocacaoObra(Estoque estoque, Material material, CondicaoMaterial condicao, UUID idObra) {
        this.estoque = Objects.requireNonNull(estoque, "O local é obrigatório");
        this.material = Objects.requireNonNull(material, "O material é obrigatório");
        this.condicao = Objects.requireNonNullElse(condicao, CondicaoMaterial.NOVO);
        this.idObra = Objects.requireNonNull(idObra, "A obra é obrigatória");
    }

    public void alocar(BigDecimal qtd) {
        exigirPositiva(qtd);
        this.quantidade = this.quantidade.add(qtd);
    }

    /** Tira até {@code qtd} da obra e devolve quanto saiu de fato (nunca deixa negativa). */
    public BigDecimal liberar(BigDecimal qtd) {
        exigirPositiva(qtd);
        BigDecimal saiu = qtd.min(this.quantidade);
        this.quantidade = this.quantidade.subtract(saiu);
        return saiu;
    }

    private static void exigirPositiva(BigDecimal qtd) {
        if (qtd == null || qtd.signum() <= 0) {
            throw new IllegalArgumentException("A quantidade deve ser positiva.");
        }
    }
}
