package com.nexo.app.modules.frota.domain;

/** O que aconteceu com o pneu (histórico somente inserção). */
public enum TipoEventoPneu {
    CADASTRO("Cadastro"),
    MONTAGEM("Montagem"),
    DESMONTAGEM("Desmontagem"),
    RODIZIO("Rodízio"),
    ENVIO_REPARO("Envio para reparo"),
    RETORNO_REPARO("Retorno do reparo"),
    ENVIO_REFORMA("Envio para reforma"),
    RETORNO_REFORMA("Retorno da reforma"),
    DESCARTE("Descarte"),
    INSPECAO("Inspeção"),
    TRANSFERENCIA("Transferência de almoxarifado"),
    CORRECAO("Correção");

    private final String rotulo;

    TipoEventoPneu(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    /** Eventos que somam no custo do pneu (o valor de compra entra pelo cadastro). */
    public boolean isCusto() {
        return this == RETORNO_REPARO || this == RETORNO_REFORMA;
    }
}
