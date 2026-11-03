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
import java.util.Locale;
import java.util.UUID;

/** Peça ou consumível usado na OS, com a origem (estoque ou compra). */
@Entity
@Table(name = "frota_os_pecas")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PecaOrdemServico extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_ordem_servico", nullable = false, updatable = false)
    private OrdemServico ordem;

    @Column(name = "descricao", nullable = false, length = 300)
    private String descricao;

    @Column(name = "codigo", length = 60)
    private String codigo;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem", nullable = false, length = 20)
    private OrigemPeca origem;

    @Column(name = "quantidade", nullable = false, precision = 12, scale = 3)
    private BigDecimal quantidade;

    /** Unidade de medida da quantidade, ex.: UN, L, KG, M, JG. */
    @Column(name = "unidade", nullable = false, length = 10)
    private String unidade;

    @Column(name = "valor_unitario", nullable = false, precision = 14, scale = 4)
    private BigDecimal valorUnitario;

    @Column(name = "subtotal", nullable = false, precision = 14, scale = 2)
    private BigDecimal subtotal;

    /** Peça do catálogo da frota (módulo estoque); só com origem ESTOQUE. */
    @Column(name = "id_material")
    private UUID idMaterial;

    /** Almoxarifado da frota de onde saiu a peça. */
    @Column(name = "id_estoque")
    private UUID idEstoque;

    /** Saída no estoque; é estornada quando a peça sai da OS ou muda. */
    @Column(name = "id_movimentacao_estoque")
    private UUID idMovimentacaoEstoque;

    PecaOrdemServico(OrdemServico ordem) {
        this.ordem = ordem;
    }

    void vincularEstoque(UUID idMaterial, UUID idEstoque, UUID idMovimentacao) {
        if (origem != OrigemPeca.ESTOQUE) {
            throw new InvarianteVioladaException("Só a peça com origem estoque sai do almoxarifado.");
        }
        this.idMaterial = idMaterial;
        this.idEstoque = idEstoque;
        this.idMovimentacaoEstoque = idMovimentacao;
    }

    void desvincularEstoque() {
        this.idMaterial = null;
        this.idEstoque = null;
        this.idMovimentacaoEstoque = null;
    }

    public boolean isBaixadaNoEstoque() {
        return idMovimentacaoEstoque != null;
    }

    void preencher(OrdemServico.DadosPeca dados) {
        if (dados.origem() == null) {
            throw new InvarianteVioladaException("Informe se a peça veio do estoque ou de compra.");
        }
        this.descricao = Textos.obrigatorio(dados.descricao(), "nome da peça", 300);
        this.codigo = Textos.opcional(dados.codigo(), 60);
        this.origem = dados.origem();
        this.unidade = Textos.obrigatorio(dados.unidade(), "tipo de unidade (UN, L, KG...)", 10).toUpperCase(Locale.ROOT);
        this.quantidade = LancamentoOrdemServico.quantidade(dados.quantidade());
        this.valorUnitario = LancamentoOrdemServico.valorUnitario(dados.valorUnitario());
        this.subtotal = LancamentoOrdemServico.subtotal(quantidade, valorUnitario);
    }
}
