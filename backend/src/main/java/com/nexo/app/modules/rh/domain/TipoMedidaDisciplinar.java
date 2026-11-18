package com.nexo.app.modules.rh.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Tipo de medida disciplinar (orientação, advertência, suspensão...). A gravidade, de 1 a 5,
 * ordena os tipos e indica o agravamento sugerido na reincidência.
 */
@Entity
@Table(name = "rh_tipos_medida_disciplinar")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TipoMedidaDisciplinar extends BaseEntity {

    public static final int GRAVIDADE_MINIMA = 1;
    public static final int GRAVIDADE_MAXIMA = 5;

    @Column(name = "nome", nullable = false, length = 80)
    private String nome;

    @Column(name = "gravidade", nullable = false)
    private Integer gravidade;

    /** Suspensão: a medida exige dias e início. */
    @Column(name = "exige_periodo", nullable = false)
    private boolean exigePeriodo;

    public TipoMedidaDisciplinar(String nome, Integer gravidade, boolean exigePeriodo) {
        atualizar(nome, gravidade, exigePeriodo);
    }

    public void atualizar(String nome, Integer gravidade, boolean exigePeriodo) {
        if (gravidade == null || gravidade < GRAVIDADE_MINIMA || gravidade > GRAVIDADE_MAXIMA) {
            throw new InvarianteVioladaException("A gravidade deve estar entre 1 e 5.");
        }
        this.nome = TextosRh.obrigatorio(nome, "Informe o nome do tipo de medida.", 80);
        this.gravidade = gravidade;
        this.exigePeriodo = exigePeriodo;
    }
}
