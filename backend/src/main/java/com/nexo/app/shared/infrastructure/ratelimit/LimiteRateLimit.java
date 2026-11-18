package com.nexo.app.shared.infrastructure.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.BucketConfiguration;

import java.time.Duration;
import java.util.Objects;

/** Limite efetivo de uma política, já com a configuração aplicada sobre os padrões. */
record LimiteRateLimit(
        PoliticaRateLimit politica,
        ModoRateLimit modo,
        long capacidade,
        Duration periodo,
        FalhaArmazem falhaArmazem,
        BucketConfiguration configuracao) {

    LimiteRateLimit {
        Objects.requireNonNull(politica, "politica é obrigatória");
        Objects.requireNonNull(modo, "modo é obrigatório");
        Objects.requireNonNull(periodo, "periodo é obrigatório");
        Objects.requireNonNull(falhaArmazem, "falhaArmazem é obrigatória");
        Objects.requireNonNull(configuracao, "configuracao é obrigatória");
    }

    static LimiteRateLimit de(PoliticaRateLimit politica, ModoRateLimit modo, long capacidade,
                              Duration periodo, FalhaArmazem falhaArmazem) {
        BucketConfiguration configuracao = BucketConfiguration.builder()
                .addLimit(Bandwidth.builder().capacity(capacidade).refillGreedy(capacidade, periodo).build())
                .build();
        return new LimiteRateLimit(politica, modo, capacidade, periodo, falhaArmazem, configuracao);
    }
}
