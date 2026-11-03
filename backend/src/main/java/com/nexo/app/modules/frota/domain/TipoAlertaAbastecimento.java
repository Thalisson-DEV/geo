package com.nexo.app.modules.frota.domain;

/** Alertas de aderência do abastecimento. Nenhum bloqueia: ajudam quem aprova e quem libera. */
public enum TipoAlertaAbastecimento {
    MEDICAO_MENOR("Medição menor que a anterior"),
    VOLUME_ACIMA_TANQUE("Volume acima do tanque"),
    CONSUMO_FORA_PADRAO("Consumo fora do padrão"),
    PRECO_ACIMA_MEDIA("Preço acima da média"),
    FOTO_REPETIDA("Foto repetida"),
    FREQUENCIA_ALTA("Intervalo curto desde o último"),
    POSTO_SEM_PRECO("Posto sem preço cadastrado"),
    SEM_CHECKLIST("Sem checklist do dia"),
    LONGE_DO_POSTO("Abastecido longe do posto");

    private final String rotulo;

    TipoAlertaAbastecimento(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
