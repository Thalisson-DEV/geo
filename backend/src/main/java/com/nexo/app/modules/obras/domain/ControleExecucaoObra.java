package com.nexo.app.modules.obras.domain;

/** Como a execução da obra é identificada na solicitação de material. */
public enum ControleExecucaoObra {
    /** O material é solicitado direto na obra (Comum, LPT, Kit, Medidor). */
    OBRA,
    /** O material é solicitado direto na ordem de serviço digitada na solicitação. */
    OS,
    /** O material é solicitado direto na ocorrência digitada na solicitação. */
    OC;

    /** OS e OC: a solicitação vai para a execução (número digitado), não para a obra. */
    public boolean porExecucao() {
        return this != OBRA;
    }
}
