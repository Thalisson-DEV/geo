package com.nexo.app.shared.infrastructure.ratelimit;

/** Como uma política reage quando o limite é excedido. */
public enum ModoRateLimit {
    /** Não conta nem bloqueia. */
    DESLIGADO,
    /** Conta e registra quem excederia (log e métrica), mas deixa a requisição seguir. */
    SOMBRA,
    /** Conta e responde 429 a quem exceder. */
    ATIVO
}
