package com.nexo.app.modules.estoque.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;
import java.util.UUID;

/**
 * Decisão do almoxarifado sobre uma série aplicada em campo que nunca esteve no estoque da
 * equipe: qual série do caminhão era a aplicada (ela sai da equipe) ou que nenhuma corresponde.
 * A quantidade não muda: a aplicação já a baixou.
 */
@Entity
@Table(name = "conciliacoes_series_aplicadas")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ConciliacaoSerieAplicada extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_estoque", nullable = false)
    private Estoque estoque;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_material", nullable = false)
    private Material material;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_movimentacao_aplicacao", nullable = false)
    private MovimentacaoEstoque aplicacao;

    @Column(name = "num_serie_aplicada", nullable = false, length = 100)
    private String numSerieAplicada;

    @Column(name = "num_serie_baixada", length = 100)
    private String numSerieBaixada;

    @Column(name = "id_usuario", nullable = false)
    private UUID idUsuario;

    private ConciliacaoSerieAplicada(MovimentacaoEstoque aplicacao, String numSerieBaixada, UUID idUsuario) {
        Objects.requireNonNull(aplicacao, "A aplicação é obrigatória.");
        if (aplicacao.getTipo() != MovimentacaoEstoque.TipoMovimentacao.APLICACAO
                || aplicacao.getEstoqueOrigem() == null
                || aplicacao.getNumSerie() == null || aplicacao.getNumSerie().isBlank()) {
            throw new InvarianteVioladaException("Só uma aplicação em campo com número de série pode ser conciliada.");
        }
        this.aplicacao = aplicacao;
        this.estoque = aplicacao.getEstoqueOrigem();
        this.material = aplicacao.getMaterial();
        this.numSerieAplicada = aplicacao.getNumSerie();
        this.numSerieBaixada = numSerieBaixada;
        this.idUsuario = Objects.requireNonNull(idUsuario, "O usuário é obrigatório.");
    }

    /** A série aplicada era, na verdade, esta série do caminhão (digitada diferente). */
    public static ConciliacaoSerieAplicada comSerieDoEstoque(MovimentacaoEstoque aplicacao, SaldoSerie serie, UUID idUsuario) {
        Objects.requireNonNull(serie, "A série do estoque é obrigatória.");
        if (!serie.isAtivo() || serie.getCondicao() != CondicaoMaterial.NOVO
                || !serie.getEstoque().getId().equals(aplicacao.getEstoqueOrigem().getId())
                || !serie.getMaterial().getId().equals(aplicacao.getMaterial().getId())) {
            throw new InvarianteVioladaException("A série " + serie.getNumSerie()
                    + " não está disponível neste estoque para este material.");
        }
        return new ConciliacaoSerieAplicada(aplicacao, serie.getNumSerie(), idUsuario);
    }

    /** Nenhuma série do caminhão corresponde: a aplicação sai da lista sem mexer no estoque. */
    public static ConciliacaoSerieAplicada semCorrespondente(MovimentacaoEstoque aplicacao, UUID idUsuario) {
        return new ConciliacaoSerieAplicada(aplicacao, null, idUsuario);
    }
}
