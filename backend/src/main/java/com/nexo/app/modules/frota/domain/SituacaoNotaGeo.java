package com.nexo.app.modules.frota.domain;

/** Nota do turno comparada com a posição do veículo no instante do lançamento. */
public enum SituacaoNotaGeo {
    NO_LOCAL("No local"),
    FORA_DO_LOCAL("Fora do local"),
    SEM_POSICAO_VEICULO("Sem posição do veículo"),
    SEM_COORDENADA_NOTA("Nota sem coordenada");

    private final String rotulo;

    SituacaoNotaGeo(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
