package com.nexo.app.modules.frota.domain;

/** Razão do serviço, com os mesmos valores do financeiro para pré-preencher a compra. */
public enum MotivoServico {
    DESGASTE_NATURAL("Desgaste natural"),
    ADEQUACAO_DE_MELHORIA("Adequação de melhoria"),
    PROBLEMA_MECANICO("Problema mecânico"),
    MAU_USO_DESCONTO("Mau uso / desconto"),
    OUTRA("Outra");

    private final String rotulo;

    MotivoServico(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
