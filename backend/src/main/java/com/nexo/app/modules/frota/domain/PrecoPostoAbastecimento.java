package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Preço de um produto no posto a partir de uma data. O abastecimento usa o preço vigente na
 * data e calcula o valor: a equipe não digita valor na correria do posto (gestores, 23/10/2026).
 * Mudança de preço é um registro novo; o histórico fica.
 */
@Entity
@Table(name = "frota_posto_precos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PrecoPostoAbastecimento extends BaseEntity {

    public enum Origem {
        MANUAL("Cadastro"),
        CUPOM_CONFIRMADO("Cupom confirmado");

        private final String rotulo;

        Origem(String rotulo) {
            this.rotulo = rotulo;
        }

        public String getRotulo() {
            return rotulo;
        }
    }

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_posto", nullable = false, updatable = false)
    private PostoAbastecimento posto;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_produto", nullable = false, updatable = false)
    private ProdutoAbastecimento produto;

    /** R$ por unidade com 3 casas, como no cupom. */
    @Column(name = "preco_unitario", nullable = false, precision = 12, scale = 3, updatable = false)
    private BigDecimal precoUnitario;

    @Column(name = "vigente_desde", nullable = false, updatable = false)
    private LocalDate vigenteDesde;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem", nullable = false, length = 20, updatable = false)
    private Origem origem;

    /** Abastecimento cujo cupom originou o preço (origem cupom confirmado). */
    @Column(name = "id_abastecimento", updatable = false)
    private UUID idAbastecimento;

    @Column(name = "id_usuario", updatable = false)
    private UUID idUsuario;

    public PrecoPostoAbastecimento(PostoAbastecimento posto, ProdutoAbastecimento produto, BigDecimal preco,
                                   LocalDate vigenteDesde, Origem origem, UUID idAbastecimento, UUID idUsuario) {
        if (posto == null) throw new InvarianteVioladaException("Informe o posto.");
        if (produto == null) throw new InvarianteVioladaException("Informe o produto.");
        if (preco == null || preco.signum() <= 0) {
            throw new InvarianteVioladaException("Informe o preço de " + produto.getNome() + " maior que zero.");
        }
        if (vigenteDesde == null) throw new InvarianteVioladaException("Informe a partir de quando o preço vale.");
        this.posto = posto;
        this.produto = produto;
        this.precoUnitario = preco.setScale(3, RoundingMode.HALF_UP);
        this.vigenteDesde = vigenteDesde;
        this.origem = origem == null ? Origem.MANUAL : origem;
        this.idAbastecimento = idAbastecimento;
        this.idUsuario = idUsuario;
    }

    /** Outro preço no mesmo dia substitui este: só um vale por dia de vigência. */
    public void substituir() {
        desativar();
    }
}
