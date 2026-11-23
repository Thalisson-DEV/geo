package com.nexo.app.modules.obras.domain;

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

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

/**
 * Item do orçamento da obra: um serviço (Ação do contrato) ou um material, com a operação em campo. É a referência com
 * que o planejado, o executado e o medido da obra são comparados. {@code idAcao} e {@code idMaterial} ficam
 * preenchidos quando o código bate com o contrato ou com o catálogo.
 */
@Entity
@Table(name = "itens_orcamento_obras")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ItemOrcamentoObra extends BaseEntity {

    @Column(name = "id_obra", nullable = false)
    private UUID idObra;

    @Column(name = "id_revisao")
    private UUID idRevisao;

    @Column(name = "id_importacao")
    private UUID idImportacao;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 20)
    private TipoItemKit tipo = TipoItemKit.SERVICO;

    @Enumerated(EnumType.STRING)
    @Column(name = "operacao", nullable = false, length = 20)
    private OperacaoItemKit operacao = OperacaoItemKit.INSTALAR;

    @Column(name = "codigo", nullable = false, length = 60)
    private String codigo;

    @Column(name = "descricao", length = 300)
    private String descricao;

    @Column(name = "unidade", length = 20)
    private String unidade;

    @Column(name = "quantidade", nullable = false, precision = 14, scale = 4)
    private BigDecimal quantidade;

    @Column(name = "valor_unitario", precision = 15, scale = 4)
    private BigDecimal valorUnitario;

    @Column(name = "valor_total", precision = 15, scale = 2)
    private BigDecimal valorTotal;

    @Column(name = "id_acao")
    private UUID idAcao;

    @Column(name = "id_material")
    private UUID idMaterial;

    /** Dados de um item do orçamento, antes de entrar numa revisão. */
    public record Dados(TipoItemKit tipo, OperacaoItemKit operacao, String codigo, String descricao, String unidade,
                        BigDecimal quantidade, BigDecimal valorUnitario, BigDecimal valorTotal, UUID idAcao, UUID idMaterial) {
    }

    /**
     * Serviço precisa de valor (unitário ou total); material pode vir só com a quantidade. Sem valor total, usa
     * quantidade × valor unitário.
     */
    public ItemOrcamentoObra(UUID idObra, UUID idRevisao, UUID idImportacao, Dados dados) {
        if (idObra == null) {
            throw new InvarianteVioladaException("A obra do item de orçamento é obrigatória.");
        }
        if (dados.codigo() == null || dados.codigo().isBlank()) {
            throw new InvarianteVioladaException("O código do item do orçamento é obrigatório.");
        }
        this.idObra = idObra;
        this.idRevisao = idRevisao;
        this.idImportacao = idImportacao;
        this.tipo = dados.tipo() != null ? dados.tipo() : TipoItemKit.SERVICO;
        this.codigo = limitar(dados.codigo().trim().toUpperCase(Locale.ROOT), 60);
        this.descricao = dados.descricao() != null && !dados.descricao().isBlank() ? limitar(dados.descricao().trim(), 300) : null;
        this.unidade = dados.unidade() != null && !dados.unidade().isBlank() ? limitar(dados.unidade().trim().toUpperCase(Locale.ROOT), 20) : null;
        this.idAcao = this.tipo == TipoItemKit.SERVICO ? dados.idAcao() : null;
        this.idMaterial = this.tipo == TipoItemKit.MATERIAL ? dados.idMaterial() : null;
        alterar(dados.operacao(), dados.quantidade(), dados.valorUnitario(), dados.valorTotal());
    }

    /** Ajuste do item lançado: operação, quantidade e valores. */
    public void alterar(OperacaoItemKit operacao, BigDecimal quantidade, BigDecimal valorUnitario, BigDecimal valorTotal) {
        if (quantidade == null || quantidade.signum() < 0) {
            throw new InvarianteVioladaException("A quantidade orçada deve ser informada e não pode ser negativa.");
        }
        if ((valorTotal != null && valorTotal.signum() < 0) || (valorUnitario != null && valorUnitario.signum() < 0)) {
            throw new InvarianteVioladaException("Os valores do orçamento não podem ser negativos.");
        }
        if (tipo == TipoItemKit.SERVICO && valorTotal == null && valorUnitario == null) {
            throw new InvarianteVioladaException("Informe o valor unitário ou o valor total do serviço orçado.");
        }
        this.operacao = operacao != null ? operacao : OperacaoItemKit.INSTALAR;
        this.quantidade = quantidade;
        this.valorUnitario = valorUnitario;
        BigDecimal total = valorTotal != null ? valorTotal : valorUnitario != null ? valorUnitario.multiply(quantidade) : null;
        this.valorTotal = total != null ? total.setScale(2, RoundingMode.HALF_UP) : null;
    }

    /** Mesmo item do orçamento: código (sem zeros à esquerda), tipo e operação. */
    public String chave() {
        return chave(tipo, codigo, operacao);
    }

    public static String chave(TipoItemKit tipo, String codigo, OperacaoItemKit operacao) {
        return tipo + "|" + Objects.requireNonNull(codigo).trim().toUpperCase(Locale.ROOT).replaceFirst("^0+(?=.)", "") + "|" + operacao;
    }

    private static String limitar(String texto, int limite) {
        return texto.length() > limite ? texto.substring(0, limite) : texto;
    }
}
