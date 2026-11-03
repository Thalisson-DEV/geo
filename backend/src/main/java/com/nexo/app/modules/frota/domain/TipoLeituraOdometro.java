package com.nexo.app.modules.frota.domain;

/**
 * Leitura comum ou troca de painel. A troca abre um novo trecho: as leituras seguintes só
 * são comparadas com o painel novo.
 */
public enum TipoLeituraOdometro {
    LEITURA,
    TROCA_PAINEL
}
