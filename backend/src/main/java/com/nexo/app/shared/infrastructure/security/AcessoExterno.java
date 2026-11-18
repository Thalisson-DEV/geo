package com.nexo.app.shared.infrastructure.security;

import java.util.Objects;
import java.util.UUID;

/**
 * Acesso de uma IA externa (servidor MCP) em nome de um usuário. Vai nos detalhes da autenticação:
 * quem trata a requisição sabe que não é a sessão do navegador e respeita o que a conexão permite.
 *
 * @param usuarioId      dono da conexão
 * @param conexaoId      conexão autorizada pelo usuário
 * @param permiteEscrita a conexão pode cadastrar e alterar registros
 */
public record AcessoExterno(UUID usuarioId, UUID conexaoId, boolean permiteEscrita) {

    /** Prefixo das credenciais de acesso externo; tudo que não começa assim é JWT da sessão. */
    public static final String PREFIXO = "geo_";

    /**
     * Prefixo das credenciais emitidas antes da troca de nome do produto. Continuam valendo até expirar
     * ou serem revogadas; nenhuma credencial nova sai com ele.
     */
    static final String PREFIXO_LEGADO = "ces_"; // renomear-geo: manter (credenciais já emitidas)

    public AcessoExterno {
        Objects.requireNonNull(usuarioId, "usuarioId");
        Objects.requireNonNull(conexaoId, "conexaoId");
    }

    public static boolean isCredencialExterna(String token) {
        return token != null && (token.startsWith(PREFIXO) || token.startsWith(PREFIXO_LEGADO));
    }
}
