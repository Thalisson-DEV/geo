package com.nexo.app.modules.frota.domain;

/**
 * Para que o checklist foi feito. O de uso tem condutor e conta para o checklist do dia; o
 * recebimento e a devolução (ex.: carro locado chegando ou indo embora) são registros sem
 * condutor, feitos por quem não vai dirigir.
 */
public enum FinalidadeChecklist {
    USO("Uso do veículo"),
    RECEBIMENTO("Recebimento do veículo"),
    DEVOLUCAO("Devolução do veículo");

    private final String rotulo;

    FinalidadeChecklist(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    public boolean temCondutor() {
        return this == USO;
    }
}
