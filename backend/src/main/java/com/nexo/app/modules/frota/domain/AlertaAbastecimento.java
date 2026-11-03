package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
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

/** Alerta gravado no abastecimento, para a fila filtrar e mostrar sem recalcular. */
@Entity
@Table(name = "frota_abastecimento_alertas")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AlertaAbastecimento extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_abastecimento", nullable = false, updatable = false)
    private Abastecimento abastecimento;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 40, updatable = false)
    private TipoAlertaAbastecimento tipo;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem", nullable = false, length = 20, updatable = false)
    private OrigemAlertaAbastecimento origem;

    @Enumerated(EnumType.STRING)
    @Column(name = "etapa", nullable = false, length = 20, updatable = false)
    private EtapaAlertaAbastecimento etapa;

    @Column(name = "mensagem", nullable = false, length = 500, updatable = false)
    private String mensagem;

    AlertaAbastecimento(Abastecimento abastecimento, EtapaAlertaAbastecimento etapa, AnaliseAbastecimento.Alerta alerta) {
        this.abastecimento = abastecimento;
        this.etapa = etapa;
        this.tipo = alerta.tipo();
        this.origem = OrigemAlertaAbastecimento.PROGRAMATICO;
        this.mensagem = alerta.mensagem().length() > 500 ? alerta.mensagem().substring(0, 500) : alerta.mensagem();
    }
}
