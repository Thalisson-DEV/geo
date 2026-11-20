package com.nexo.app.modules.sincronizacao.domain;

public enum TipoOperacaoSincronizacao {
    TURNO, EXECUCAO, SOLICITACAO, TRANSFERENCIA, INSPECAO, ANEXO,
    /** Registros do app de campo de Obras: aplicados na hora pelo adaptador de Obras. */
    OBRA_APR, OBRA_APR_CONCLUSAO, OBRA_OCORRENCIA, OBRA_ATIVIDADE, OBRA_APONTAMENTO, OBRA_PRESENCA, OBRA_EVIDENCIA, OBRA_RELATORIO;

    public boolean deObras() {
        return name().startsWith("OBRA_");
    }
}
