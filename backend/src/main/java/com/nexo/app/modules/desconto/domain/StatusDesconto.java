package com.nexo.app.modules.desconto.domain;

/**
 * Ciclo do termo: SOLICITADO → VALIDADO → BAIXADO → FINALIZADO, ou REJEITADO.
 * FINALIZADO é o termo baixado com o documento assinado pelo colaborador anexado.
 */
public enum StatusDesconto {
    SOLICITADO,
    VALIDADO,
    BAIXADO,
    REJEITADO,
    FINALIZADO;

    /**
     * Já entrou na folha. Indicadores e relatórios que somam o que foi descontado
     * contam o finalizado junto com o baixado: o termo assinado não muda o valor.
     */
    public boolean baixadoEmFolha() {
        return this == BAIXADO || this == FINALIZADO;
    }
}
