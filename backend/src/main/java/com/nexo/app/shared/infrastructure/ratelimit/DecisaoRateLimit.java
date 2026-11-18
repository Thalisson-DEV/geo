package com.nexo.app.shared.infrastructure.ratelimit;

import java.time.Duration;

/**
 * Resultado de uma verificação de limite.
 *
 * @param resultado           se passou, se passaria só por estar em modo sombra, ou se foi barrada
 * @param retryAfterSegundos  quanto esperar até caber uma nova requisição (zero quando passou)
 */
public record DecisaoRateLimit(
        PoliticaRateLimit politica,
        Resultado resultado,
        long capacidade,
        Duration periodo,
        long retryAfterSegundos) {

    public enum Resultado { LIBERADA, SOMBRA, BLOQUEADA }

    public boolean bloqueada() {
        return resultado == Resultado.BLOQUEADA;
    }

    static DecisaoRateLimit liberada(PoliticaRateLimit politica) {
        return new DecisaoRateLimit(politica, Resultado.LIBERADA, 0, Duration.ZERO, 0);
    }

    static DecisaoRateLimit excedida(LimiteRateLimit limite, Resultado resultado, long nanosParaEsperar) {
        // Arredonda para cima: dizer "1 segundo" e recusar de novo no instante seguinte é pior.
        long segundos = Math.max(1, (nanosParaEsperar + 999_999_999L) / 1_000_000_000L);
        return new DecisaoRateLimit(limite.politica(), resultado, limite.capacidade(), limite.periodo(), segundos);
    }
}
