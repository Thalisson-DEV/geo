package com.nexo.app.modules.rh.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Linha do histórico da medida: o que aconteceu, quando e por quem. Nunca é alterada. */
@Entity
@Table(name = "rh_medida_disciplinar_historico")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class HistoricoMedidaDisciplinar extends BaseEntity {

    @Column(name = "id_medida", nullable = false, updatable = false)
    private UUID idMedida;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 30, updatable = false)
    private TipoEventoMedidaDisciplinar tipo;

    @Column(name = "descricao", nullable = false, length = 500, updatable = false)
    private String descricao;

    @Column(name = "id_usuario", updatable = false)
    private UUID idUsuario;

    @Column(name = "ocorrido_em", nullable = false, updatable = false)
    private OffsetDateTime ocorridoEm;

    public HistoricoMedidaDisciplinar(UUID idMedida, TipoEventoMedidaDisciplinar tipo, String descricao, UUID idUsuario,
                                      OffsetDateTime ocorridoEm) {
        this.idMedida = idMedida;
        this.tipo = tipo;
        this.descricao = descricao.length() <= 500 ? descricao : descricao.substring(0, 500);
        this.idUsuario = idUsuario;
        this.ocorridoEm = ocorridoEm;
    }
}
