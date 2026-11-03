package com.nexo.app.modules.frota.domain;

import java.math.BigDecimal;

/**
 * Leitura das fotos do abastecimento por IA (etapa seguinte): KM e ponteiro do tanque no
 * painel; litros, valor e posto no cupom. A IA só aponta, nunca reprova. Hoje a implementação
 * não analisa; trocar de modelo é trocar a implementação, sem mexer no fluxo.
 */
public interface AnaliseFotoAbastecimento {

    enum Resultado { CONFERE, DIVERGE, ILEGIVEL, NAO_ANALISADO }

    /**
     * @param medicaoInformada KM ou horas que a pessoa digitou
     * @param litrosInformados litros do combustível no realizado (nulo na solicitação)
     */
    record Contexto(TipoFotoAbastecimento tipo, BigDecimal medicaoInformada, BigDecimal litrosInformados,
                    BigDecimal valorInformado, String posto) {
    }

    /** @param observacao o que a IA leu, para o alerta (nula quando não analisou) */
    record Analise(Resultado resultado, String observacao) {
    }

    Analise analisar(byte[] foto, String contentType, Contexto contexto);
}
