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

/** Foto exigida na troca de condutor (ex.: "Lateral esquerda"). */
@Entity
@Table(name = "frota_checklist_modelo_fotos_recebimento")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FotoRecebimentoChecklist extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_modelo", nullable = false, updatable = false)
    private ModeloChecklist modelo;

    @Column(name = "ordem", nullable = false)
    private int ordem;

    @Column(name = "descricao", nullable = false, length = 120)
    private String descricao;

    FotoRecebimentoChecklist(ModeloChecklist modelo) {
        this.modelo = modelo;
    }

    void preencher(int ordem, String descricao) {
        this.ordem = ordem;
        this.descricao = Textos.obrigatorio(descricao, "descrição da foto de recebimento", 120);
    }
}
