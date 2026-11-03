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

import java.util.UUID;

/**
 * Item de manutenção tratado numa OS. Ao concluir a OS, guarda a OS anterior com o
 * mesmo item na mesma placa, quando ela caiu dentro da janela de repetição.
 */
@Entity
@Table(name = "frota_os_itens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ItemOrdemServico extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_ordem_servico", nullable = false, updatable = false)
    private OrdemServico ordem;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_item_manutencao", nullable = false, updatable = false)
    private ItemManutencao item;

    @Column(name = "id_os_anterior")
    private UUID idOsAnterior;

    @Column(name = "numero_os_anterior")
    private Long numeroOsAnterior;

    @Column(name = "dias_desde_anterior")
    private Integer diasDesdeAnterior;

    ItemOrdemServico(OrdemServico ordem, ItemManutencao item) {
        this.ordem = ordem;
        this.item = item;
    }

    public void registrarRepeticao(UUID idOsAnterior, Long numeroOsAnterior, int diasDesdeAnterior) {
        this.idOsAnterior = idOsAnterior;
        this.numeroOsAnterior = numeroOsAnterior;
        this.diasDesdeAnterior = diasDesdeAnterior;
    }

    public boolean isRepeticao() {
        return idOsAnterior != null;
    }
}
