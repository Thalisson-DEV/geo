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
import java.util.Collection;
import java.util.Objects;
import java.util.UUID;

/**
 * Uma versão do orçamento da obra. Importar, gerar pelo planejamento ou gravar a planilha de medição cria uma revisão
 * nova; lançar, alterar ou tirar um item mexe na revisão atual (a de maior número). Os totais acompanham os itens.
 */
@Entity
@Table(name = "revisoes_orcamento_obras")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RevisaoOrcamentoObra extends BaseEntity {

    @Column(name = "id_obra", nullable = false)
    private UUID idObra;

    @Column(name = "numero", nullable = false)
    private int numero;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem", nullable = false, length = 30)
    private OrigemOrcamento origem;

    @Column(name = "observacao", length = 500)
    private String observacao;

    @Column(name = "id_importacao")
    private UUID idImportacao;

    @Column(name = "valor_servicos", nullable = false, precision = 15, scale = 2)
    private BigDecimal valorServicos = BigDecimal.ZERO;

    @Column(name = "valor_materiais", nullable = false, precision = 15, scale = 2)
    private BigDecimal valorMateriais = BigDecimal.ZERO;

    @Column(name = "quantidade_itens", nullable = false)
    private int quantidadeItens;

    public RevisaoOrcamentoObra(UUID idObra, int numero, OrigemOrcamento origem, String observacao, UUID idImportacao) {
        if (idObra == null) {
            throw new InvarianteVioladaException("A obra do orçamento é obrigatória.");
        }
        if (numero < 1) {
            throw new InvarianteVioladaException("O número da revisão do orçamento começa em 1.");
        }
        this.idObra = idObra;
        this.numero = numero;
        this.origem = Objects.requireNonNull(origem);
        this.observacao = observacao != null && !observacao.isBlank()
                ? observacao.trim().substring(0, Math.min(observacao.trim().length(), 500)) : null;
        this.idImportacao = idImportacao;
    }

    /** Refaz os totais pelos itens ativos da revisão. */
    public void totalizar(Collection<ItemOrcamentoObra> itens) {
        BigDecimal servicos = BigDecimal.ZERO;
        BigDecimal materiais = BigDecimal.ZERO;
        int quantidade = 0;
        for (ItemOrcamentoObra item : itens) {
            if (!item.isAtivo()) {
                continue;
            }
            quantidade++;
            BigDecimal valor = item.getValorTotal() != null ? item.getValorTotal() : BigDecimal.ZERO;
            if (item.getTipo() == TipoItemKit.MATERIAL) {
                materiais = materiais.add(valor);
            } else {
                servicos = servicos.add(valor);
            }
        }
        this.valorServicos = servicos.setScale(2, RoundingMode.HALF_UP);
        this.valorMateriais = materiais.setScale(2, RoundingMode.HALF_UP);
        this.quantidadeItens = quantidade;
    }
}
