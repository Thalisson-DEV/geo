package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Subtipo de uma despesa (ex.: lavagem completa, a seco). */
@Entity
@Table(name = "frota_subtipos_despesa")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SubtipoDespesa extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_tipo", nullable = false, updatable = false)
    private TipoDespesa tipo;

    @Column(name = "nome", nullable = false, length = 80)
    private String nome;

    @Column(name = "ordem", nullable = false)
    private int ordem;

    SubtipoDespesa(TipoDespesa tipo, String nome, int ordem) {
        this.tipo = tipo;
        this.nome = Textos.obrigatorio(nome, "nome do subtipo", 80);
        this.ordem = ordem;
    }

    void reordenar(String nome, int ordem) {
        this.nome = Textos.obrigatorio(nome, "nome do subtipo", 80);
        this.ordem = ordem;
        if (!isAtivo()) {
            ativar();
        }
    }
}
