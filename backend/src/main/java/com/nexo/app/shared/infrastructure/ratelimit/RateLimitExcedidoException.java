package com.nexo.app.shared.infrastructure.ratelimit;

import java.util.Objects;

/** Limite excedido numa política em modo ativo; vira 429 com {@code Retry-After} no handler global. */
public class RateLimitExcedidoException extends RuntimeException {

    private final transient DecisaoRateLimit decisao;

    public RateLimitExcedidoException(DecisaoRateLimit decisao) {
        super(Objects.requireNonNull(decisao, "decisao é obrigatória").politica().mensagem());
        this.decisao = decisao;
    }

    public DecisaoRateLimit getDecisao() {
        return decisao;
    }

    public long getRetryAfter() {
        return decisao.retryAfterSegundos();
    }
}
