package com.nexo.app.modules.rh.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * Limiares do RH que o administrador ajusta sem deploy. Existe uma única linha, criada pela
 * migração com o id {@link #ID_UNICO}.
 */
@Entity
@Table(name = "rh_parametros")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ParametrosRh extends BaseEntity {

    public static final UUID ID_UNICO = UUID.fromString("00000000-0000-0000-0000-000000000a01");

    /** Meses para trás em que uma medida do mesmo motivo conta como reincidência. */
    @Column(name = "janela_reincidencia_meses", nullable = false)
    private Integer janelaReincidenciaMeses = 12;

    /** Acima disto entre o fato e a aplicação, o formulário avisa do risco de perdão tácito. */
    @Column(name = "dias_imediatidade", nullable = false)
    private Integer diasImediatidade = 30;

    public void atualizar(Integer janelaReincidenciaMeses, Integer diasImediatidade) {
        if (janelaReincidenciaMeses == null || janelaReincidenciaMeses < 1 || janelaReincidenciaMeses > 60) {
            throw new InvarianteVioladaException("A janela de reincidência deve estar entre 1 e 60 meses.");
        }
        if (diasImediatidade == null || diasImediatidade < 1 || diasImediatidade > 365) {
            throw new InvarianteVioladaException("O prazo de imediatidade deve estar entre 1 e 365 dias.");
        }
        this.janelaReincidenciaMeses = janelaReincidenciaMeses;
        this.diasImediatidade = diasImediatidade;
    }
}
