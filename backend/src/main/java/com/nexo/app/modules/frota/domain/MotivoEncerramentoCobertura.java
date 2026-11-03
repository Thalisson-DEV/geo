package com.nexo.app.modules.frota.domain;

/** Por que o veículo saiu da apólice antes do fim da vigência. */
public enum MotivoEncerramentoCobertura {
    VENDA("Venda do veículo"),
    PERDA_TOTAL("Perda total"),
    FURTO_ROUBO("Furto ou roubo"),
    DEVOLUCAO("Devolução à locadora"),
    TROCA_APOLICE("Passou para outra apólice"),
    OUTRO("Outro motivo");

    private final String rotulo;

    MotivoEncerramentoCobertura(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
