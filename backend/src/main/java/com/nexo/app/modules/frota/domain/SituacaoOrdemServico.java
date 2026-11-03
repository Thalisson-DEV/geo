package com.nexo.app.modules.frota.domain;

import java.util.EnumSet;
import java.util.Set;

/** Etapa da OS no painel de acompanhamento. */
public enum SituacaoOrdemServico {
    PENDENTE("Pendente"),
    AGENDADA("Agendada"),
    EM_ANDAMENTO("Em andamento"),
    CONCLUIDA("Concluída"),
    CANCELADA("Cancelada");

    /** Situações em que a OS ainda pode mudar. */
    public static final Set<SituacaoOrdemServico> ABERTAS = EnumSet.of(PENDENTE, AGENDADA, EM_ANDAMENTO);

    private final String rotulo;

    SituacaoOrdemServico(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    public boolean isAberta() {
        return ABERTAS.contains(this);
    }
}
