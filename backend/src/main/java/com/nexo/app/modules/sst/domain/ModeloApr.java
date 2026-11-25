package com.nexo.app.modules.sst.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Cadastro da APR que a equipe preenche no app antes de executar: o que ela pode marcar e o que vem sugerido em cada
 * condição do serviço. Há um único cadastro por implantação, criado com as opções padrão e ajustado pelo SST do cliente.
 */
@Entity
@Table(name = "modelos_apr")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ModeloApr extends BaseEntity {

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "estrutura", nullable = false, columnDefinition = "jsonb")
    private EstruturaApr estrutura;

    public ModeloApr(EstruturaApr estrutura) {
        alterar(estrutura);
    }

    public void alterar(EstruturaApr estrutura) {
        if (estrutura == null) {
            throw new InvarianteVioladaException("Informe os riscos, as medidas e as verificações da APR.");
        }
        EstruturaApr limpa = estrutura.normalizada();
        limpa.validar();
        this.estrutura = limpa;
    }
}
