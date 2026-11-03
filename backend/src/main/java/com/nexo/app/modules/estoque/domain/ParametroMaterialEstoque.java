package com.nexo.app.modules.estoque.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.UUID;

/** Mínimo e localização física (prateleira, gaveta) de um material num estoque. */
@Entity
@Table(name = "estoque_parametros_material")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ParametroMaterialEstoque extends BaseEntity {

    @Column(name = "id_estoque", nullable = false, updatable = false)
    private UUID idEstoque;

    @Column(name = "id_material", nullable = false, updatable = false)
    private UUID idMaterial;

    @Column(name = "estoque_minimo", precision = 12, scale = 3)
    private BigDecimal estoqueMinimo;

    @Column(name = "localizacao", length = 60)
    private String localizacao;

    public ParametroMaterialEstoque(UUID idEstoque, UUID idMaterial) {
        this.idEstoque = idEstoque;
        this.idMaterial = idMaterial;
    }

    public void definir(BigDecimal estoqueMinimo, String localizacao) {
        if (estoqueMinimo != null && estoqueMinimo.signum() < 0) {
            throw new InvarianteVioladaException("O mínimo não pode ser negativo.");
        }
        String local = localizacao == null || localizacao.isBlank() ? null : localizacao.trim();
        if (local != null && local.length() > 60) {
            throw new InvarianteVioladaException("A localização tem no máximo 60 caracteres.");
        }
        this.estoqueMinimo = estoqueMinimo;
        this.localizacao = local;
    }
}
