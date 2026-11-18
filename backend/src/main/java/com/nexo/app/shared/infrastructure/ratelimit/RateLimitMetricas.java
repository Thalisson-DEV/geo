package com.nexo.app.shared.infrastructure.ratelimit;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import java.util.Objects;

/**
 * Métricas do rate limit. Só dimensões de baixa cardinalidade: nunca IP, usuário ou login.
 *
 * <ul>
 *   <li>{@code ces.rate_limit.excedido} (politica, modo): quem bateu no limite; em
 *       {@code SOMBRA} é o que seria barrado, base para calibrar antes de ativar.</li>
 *   <li>{@code ces.rate_limit.falha_armazem} (politica, contingencia): Redis indisponível.</li>
 * </ul>
 */
class RateLimitMetricas {

    private final MeterRegistry registry;

    RateLimitMetricas(MeterRegistry registry) {
        this.registry = Objects.requireNonNull(registry, "registry é obrigatório");
    }

    void excedido(PoliticaRateLimit politica, ModoRateLimit modo) {
        Counter.builder("ces.rate_limit.excedido")
                .description("Requisições acima do limite, por política e modo")
                .tags("politica", politica.nome(), "modo", modo.name().toLowerCase(java.util.Locale.ROOT))
                .register(registry)
                .increment();
    }

    void falhaArmazem(PoliticaRateLimit politica, FalhaArmazem contingencia) {
        Counter.builder("ces.rate_limit.falha_armazem")
                .description("Verificações feitas sem o Redis, por política e contingência aplicada")
                .tags("politica", politica.nome(), "contingencia", contingencia.name().toLowerCase(java.util.Locale.ROOT))
                .register(registry)
                .increment();
    }
}
