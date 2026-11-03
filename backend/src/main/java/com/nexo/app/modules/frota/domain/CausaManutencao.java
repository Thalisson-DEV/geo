package com.nexo.app.modules.frota.domain;

/** Por que a manutenção aconteceu, com os mesmos valores do EXP para a migração. */
public enum CausaManutencao {
    AVARIA("Avaria"),
    DESGASTE_NATURAL("Desgaste natural"),
    USO_INDEVIDO("Uso indevido"),
    SERVICO_CORRETIVO("Serviço corretivo"),
    SERVICO_PREVENTIVO("Serviço preventivo"),
    ESTOQUE("Estoque"),
    SUBSTITUICAO_PNEUS("Substituição de pneus");

    private final String rotulo;

    CausaManutencao(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
