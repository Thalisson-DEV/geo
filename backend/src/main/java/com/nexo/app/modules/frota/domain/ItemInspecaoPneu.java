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
import java.util.UUID;

/** Pressão e sulco de um pneu numa inspeção, com a posição em que ele estava. */
@Entity
@Table(name = "frota_pneu_inspecao_itens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ItemInspecaoPneu extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_inspecao", nullable = false, updatable = false)
    private InspecaoPneu inspecao;

    @Column(name = "id_pneu", nullable = false, updatable = false)
    private UUID idPneu;

    @Column(name = "posicao", nullable = false, length = 5, updatable = false)
    private String posicao;

    @Column(name = "pressao_psi")
    private Integer pressaoPsi;

    @Column(name = "sulco_mm", precision = 4, scale = 1)
    private BigDecimal sulcoMm;

    @Column(name = "observacao", length = 300)
    private String observacao;

    ItemInspecaoPneu(InspecaoPneu inspecao, Pneu pneu, Integer pressaoPsi, BigDecimal sulcoMm, String observacao) {
        if (pressaoPsi != null && (pressaoPsi < 0 || pressaoPsi > 200)) {
            throw new InvarianteVioladaException("Pressão do pneu " + pneu.getMarcaFogo() + " fora da faixa (0 a 200 psi).");
        }
        if (sulcoMm != null && (sulcoMm.signum() < 0 || sulcoMm.compareTo(new BigDecimal("40")) > 0)) {
            throw new InvarianteVioladaException("Sulco do pneu " + pneu.getMarcaFogo() + " fora da faixa (0 a 40 mm).");
        }
        this.inspecao = inspecao;
        this.idPneu = pneu.getId();
        this.posicao = pneu.getPosicao();
        this.pressaoPsi = pressaoPsi;
        this.sulcoMm = sulcoMm;
        this.observacao = Textos.opcional(observacao, 300);
    }
}
