package com.nexo.app.modules.rh.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Motivo da medida disciplinar (trânsito, segurança do trabalho, conduta...). Base da reincidência. */
@Entity
@Table(name = "rh_motivos_medida_disciplinar")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MotivoMedidaDisciplinar extends BaseEntity {

    @Column(name = "nome", nullable = false, length = 80)
    private String nome;

    public MotivoMedidaDisciplinar(String nome) {
        renomear(nome);
    }

    public void renomear(String nome) {
        this.nome = TextosRh.obrigatorio(nome, "Informe o nome do motivo.", 80);
    }
}
