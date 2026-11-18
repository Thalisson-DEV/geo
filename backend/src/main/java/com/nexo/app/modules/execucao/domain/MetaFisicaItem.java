package com.nexo.app.modules.execucao.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;
import java.util.UUID;

/** Quantidade de notas de um tipo de serviço dentro da meta física da base no mês. */
@Entity
@Table(name = "metas_fisicas_itens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MetaFisicaItem extends BaseEntity {

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_meta_fisica", nullable = false)
    private MetaFisica meta;

    @NotNull
    @Column(name = "id_tipo_servico", nullable = false)
    private UUID idTipoServico;

    @Column(name = "quantidade", nullable = false)
    private int quantidade;

    /** Parcial que a Concessionária enviou para o serviço; nulo quando a meta mensal veio pronta. */
    @Column(name = "parcial_concessionaria")
    private Integer parcialConcessionária;

    MetaFisicaItem(MetaFisica meta, UUID idTipoServico, int quantidade, Integer parcialConcessionária) {
        this.meta = Objects.requireNonNull(meta, "Meta é obrigatória");
        this.idTipoServico = Objects.requireNonNull(idTipoServico, "Tipo de serviço é obrigatório");
        definir(quantidade, parcialConcessionária);
    }

    void definir(int quantidade, Integer parcialConcessionária) {
        this.quantidade = quantidade;
        this.parcialConcessionária = parcialConcessionária;
    }
}
