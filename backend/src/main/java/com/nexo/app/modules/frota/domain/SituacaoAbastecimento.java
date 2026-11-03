package com.nexo.app.modules.frota.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * Situação da solicitação de abastecimento. Em andamento: aguardando aprovação, aprovada e
 * liberada (o veículo não aceita outra solicitação enquanto houver uma assim).
 */
public enum SituacaoAbastecimento {
    AGUARDANDO_APROVACAO("Aguardando aprovação"),
    APROVADA("Aprovada"),
    REPROVADA("Reprovada"),
    LIBERADA("Liberada"),
    REALIZADA("Realizada"),
    CANCELADA("Cancelada"),
    VENCIDA("Vencida");

    public static final Set<SituacaoAbastecimento> EM_ANDAMENTO = EnumSet.of(AGUARDANDO_APROVACAO, APROVADA, LIBERADA);

    private final String rotulo;

    SituacaoAbastecimento(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    public boolean emAndamento() {
        return EM_ANDAMENTO.contains(this);
    }
}
