package com.nexo.app.shared.infrastructure.ratelimit;

/** O que fazer quando o Redis, que guarda os contadores, não responde. */
public enum FalhaArmazem {
    /** Deixa passar: o limite é proteção de tráfego e não pode derrubar a aplicação. */
    LIBERAR,
    /** Passa a contar na memória da instância até o Redis voltar (rotas sensíveis, como o login). */
    LOCAL
}
