package com.nexo.app.modules.assistente.domain;

/** Superficie do GEO onde a conversa com a Bússola comecou. O agente e o mesmo em todas. */
public enum OrigemConversa {
    WORKSPACE,
    DASHBOARD,
    /** Conversa tecnica de uma conexao de IA externa (MCP); fora do historico da Bússola. */
    MCP
}
