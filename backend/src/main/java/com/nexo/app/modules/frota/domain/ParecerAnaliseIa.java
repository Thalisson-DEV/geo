package com.nexo.app.modules.frota.domain;

/** Conclusão da IA sobre o registro. Só aponta: nunca aprova nem reprova. */
public enum ParecerAnaliseIa {
    SEM_RESSALVAS("Sem ressalvas"),
    ATENCAO("Pede atenção"),
    CRITICO("Crítico");

    private final String rotulo;

    ParecerAnaliseIa(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
