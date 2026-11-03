package com.nexo.app.modules.frota.domain;

/** O que aparece no calendário da frota. Cada tipo respeita a permissão de leitura do que mostra. */
public enum TipoEventoAgendaFrota {
    OS_AGENDADA("OS agendada"),
    OS_PREVISAO_TERMINO("Previsão de término"),
    DOCUMENTO_VENCIMENTO("Documento vencendo"),
    CNH_VENCIMENTO("CNH vencendo"),
    PREVENTIVA_PREVISTA("Preventiva prevista"),
    APOLICE_VENCIMENTO("Apólice vencendo");

    private final String rotulo;

    TipoEventoAgendaFrota(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
