package com.nexo.app.shared.infrastructure.ratelimit;

/** Onde ficam os baldes. A chave já chega sem dado pessoal (ver {@link RateLimiter}). */
interface ArmazemBuckets {

    /** Tenta consumir uma ficha. Se não couber, devolve quanto falta esperar. */
    Consumo consumir(String chave, LimiteRateLimit limite);

    /** Diz se uma ficha caberia agora, sem consumir. */
    Consumo estimar(String chave, LimiteRateLimit limite);

    record Consumo(boolean permitido, long nanosParaEsperar) {
        static Consumo de(boolean permitido, long nanosParaEsperar) {
            return new Consumo(permitido, permitido ? 0 : Math.max(0, nanosParaEsperar));
        }
    }
}
