package com.nexo.app.modules.frota.domain;

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

/**
 * Um produto da solicitação (combustível, ARLA, óleo, fluido). A equipe pede só o produto; o
 * aprovador define a quantidade e a liberação pode ajustar, e as duas ficam guardadas. O
 * realizado registra o que o posto entregou, que pode ser outro produto da mesma categoria.
 */
@Entity
@Table(name = "frota_abastecimento_itens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ItemAbastecimento extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_abastecimento", nullable = false, updatable = false)
    private Abastecimento abastecimento;

    @Column(name = "ordem", nullable = false)
    private int ordem;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_produto_pedido", nullable = false, updatable = false)
    private ProdutoAbastecimento produtoPedido;

    /** Só nos pedidos antigos e importados: a equipe não informa mais quantidade. */
    @Column(name = "quantidade_pedida", precision = 10, scale = 2)
    private BigDecimal quantidadePedida;

    @Column(name = "quantidade_aprovada", precision = 10, scale = 2)
    private BigDecimal quantidadeAprovada;

    @Column(name = "quantidade_liberada", precision = 10, scale = 2)
    private BigDecimal quantidadeLiberada;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_produto")
    private ProdutoAbastecimento produto;

    @Column(name = "quantidade", precision = 10, scale = 2)
    private BigDecimal quantidade;

    @Column(name = "valor_total", precision = 12, scale = 2)
    private BigDecimal valorTotal;

    /** R$ por unidade com 3 casas, como no cupom. */
    @Column(name = "valor_unitario", precision = 12, scale = 3)
    private BigDecimal valorUnitario;

    @Column(name = "tanque_cheio")
    private Boolean tanqueCheio;

    ItemAbastecimento(Abastecimento abastecimento, int ordem, ProdutoAbastecimento produto, BigDecimal quantidade) {
        if (produto == null || !produto.isAtivo()) {
            throw new InvarianteVioladaException("Produto do abastecimento não encontrado ou desativado.");
        }
        this.abastecimento = abastecimento;
        this.ordem = ordem;
        this.produtoPedido = produto;
        this.quantidadePedida = quantidade == null ? null : positiva(quantidade, produto.getNome());
    }

    /** Quantidade que o aprovador autoriza; zero tira o item do abastecimento. */
    void aprovar(BigDecimal quantidade) {
        this.quantidadeAprovada = naoNegativa(quantidade, produtoPedido.getNome());
        this.quantidadeLiberada = null;
    }

    /** A liberação parte do aprovado e pode ajustar; o aprovado continua guardado. */
    void liberar(BigDecimal ajuste) {
        this.quantidadeLiberada = ajuste == null ? quantidadeAprovadaOuPedida() : naoNegativa(ajuste, produtoPedido.getNome());
    }

    /** Quantidade que vale para o posto: a liberada, senão a aprovada, senão a pedida (antigos). */
    public BigDecimal quantidadeAutorizada() {
        return quantidadeLiberada != null ? quantidadeLiberada : quantidadeAprovadaOuPedida();
    }

    /** Liberado com zero: o item não vai ao posto. */
    public boolean isRetirado() {
        var autorizada = quantidadeAutorizada();
        return autorizada != null && autorizada.signum() == 0;
    }

    private BigDecimal quantidadeAprovadaOuPedida() {
        return quantidadeAprovada != null ? quantidadeAprovada : quantidadePedida;
    }

    /** Item retirado na aprovação ou na liberação: entra no realizado com zero. */
    void naoEntregue() {
        this.produto = produtoPedido;
        this.quantidade = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        this.valorTotal = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        this.valorUnitario = null;
        this.tanqueCheio = null;
    }

    /**
     * O posto pode entregar outro produto da mesma categoria (ex.: S500 no lugar de S10).
     *
     * @param precoPosto preço vigente do produto no posto: com ele, o valor é calculado e o que
     *                   veio digitado é ignorado; sem ele, o valor digitado é obrigatório
     */
    void realizar(ProdutoAbastecimento entregue, BigDecimal quantidade, BigDecimal valorTotal, BigDecimal precoPosto,
                  Boolean tanqueCheio) {
        var efetivo = entregue == null ? produtoPedido : entregue;
        if (efetivo.getCategoria() != produtoPedido.getCategoria()) {
            throw new InvarianteVioladaException("O item " + produtoPedido.getNome() + " só pode ser trocado por outro produto da categoria "
                    + produtoPedido.getCategoria().getRotulo().toLowerCase() + ".");
        }
        if (quantidade == null || quantidade.signum() < 0) {
            throw new InvarianteVioladaException("Informe a quantidade entregue de " + efetivo.getNome() + ".");
        }
        BigDecimal total = precoPosto != null ? quantidade.multiply(precoPosto) : valorTotal;
        if (total == null || total.signum() < 0) {
            throw new InvarianteVioladaException("O posto não tem preço de " + efetivo.getNome() + " cadastrado. Informe o valor pago.");
        }
        if (quantidade.signum() == 0 && total.signum() > 0) {
            throw new InvarianteVioladaException("Há valor em " + efetivo.getNome() + " sem quantidade entregue.");
        }
        if (efetivo.isCombustivel() && quantidade.signum() > 0 && tanqueCheio == null) {
            throw new InvarianteVioladaException("Informe se o tanque foi completado.");
        }
        this.produto = efetivo;
        this.quantidade = quantidade.setScale(2, RoundingMode.HALF_UP);
        this.valorTotal = total.setScale(2, RoundingMode.HALF_UP);
        this.valorUnitario = quantidade.signum() == 0 ? null
                : precoPosto != null ? precoPosto.setScale(3, RoundingMode.HALF_UP)
                : total.divide(quantidade, 3, RoundingMode.HALF_UP);
        this.tanqueCheio = efetivo.isCombustivel() ? tanqueCheio : null;
    }

    public boolean isCombustivelEntregue() {
        return produto != null && produto.isCombustivel() && quantidade != null && quantidade.signum() > 0;
    }

    private static BigDecimal naoNegativa(BigDecimal quantidade, String produto) {
        if (quantidade == null || quantidade.signum() < 0) {
            throw new InvarianteVioladaException("Informe a quantidade de " + produto + ".");
        }
        return quantidade.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal positiva(BigDecimal quantidade, String produto) {
        if (quantidade == null || quantidade.signum() <= 0) {
            throw new InvarianteVioladaException("Informe a quantidade de " + produto + ".");
        }
        return quantidade.setScale(2, RoundingMode.HALF_UP);
    }
}
