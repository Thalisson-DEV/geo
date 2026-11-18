package com.nexo.app.shared.infrastructure.ratelimit;

import java.time.Duration;

/**
 * Políticas de rate limit da aplicação, com os valores padrão. Capacidade, período, modo e
 * comportamento sem Redis podem ser trocados em {@code ces.rate-limit.politicas.<nome>}.
 *
 * <p>O algoritmo é token bucket: cabem {@code capacidade} requisições de uma vez e o balde
 * volta a encher de forma contínua ao longo do {@code periodo}. Rajadas curtas (uma tela que
 * abre fazendo várias chamadas) passam; só o volume sustentado acima do limite é barrado.</p>
 *
 * <p>Os limites por IP são folgados de propósito: equipes de campo no 4G (CGNAT) e o
 * escritório saem por poucos IPs compartilhados.</p>
 */
public enum PoliticaRateLimit {

    /** Toda tentativa de login vinda de um IP. Cada tentativa custa um BCrypt. */
    LOGIN_IP("login-ip", TipoChave.IP, 30, Duration.ofMinutes(1), FalhaArmazem.LOCAL,
            "Muitas tentativas de entrada a partir desta rede."),
    /** Senhas erradas de um mesmo login a partir de um mesmo IP. */
    LOGIN_FALHAS_CONTA_IP("login-falhas-conta-ip", TipoChave.CONTA, 10, Duration.ofMinutes(15), FalhaArmazem.LOCAL,
            "Muitas tentativas de entrada com este login."),
    /** Senhas erradas de um mesmo login, de qualquer IP (tentativa distribuída contra uma conta). */
    LOGIN_FALHAS_CONTA("login-falhas-conta", TipoChave.CONTA, 50, Duration.ofHours(1), FalhaArmazem.LOCAL,
            "Muitas tentativas de entrada com este login."),
    /** Renovação e encerramento da sessão pelo cookie. */
    SESSAO_IP("sessao-ip", TipoChave.IP, 120, Duration.ofMinutes(1), FalhaArmazem.LIBERAR,
            "Muitas requisições em pouco tempo."),
    /** Links públicos (portal da Educação e decisão financeira por e-mail). */
    PUBLICO_IP("publico-ip", TipoChave.IP, 60, Duration.ofMinutes(1), FalhaArmazem.LOCAL,
            "Muitas requisições em pouco tempo."),
    /** Conferência pública de comprovante: além do limite público, um limite próprio contra varredura de códigos. */
    VERIFICACAO_IP("verificacao-ip", TipoChave.IP, 30, Duration.ofMinutes(1), FalhaArmazem.LOCAL,
            "Muitas verificações em pouco tempo."),
    /** Cadastro de aplicativo, troca e revogação de token das conexões de IA. */
    OAUTH_IP("oauth-ip", TipoChave.IP, 30, Duration.ofMinutes(1), FalhaArmazem.LOCAL,
            "Muitas requisições em pouco tempo."),
    /** Chamadas das conexões de IA (MCP), por usuário da credencial. */
    MCP("mcp", TipoChave.USUARIO, 240, Duration.ofMinutes(1), FalhaArmazem.LIBERAR,
            "Muitas requisições em pouco tempo."),
    /** Handshake e transportes do WebSocket (SockJS faz várias requisições por conexão). */
    WEBSOCKET_IP("websocket-ip", TipoChave.IP, 600, Duration.ofMinutes(1), FalhaArmazem.LIBERAR,
            "Muitas requisições em pouco tempo."),
    /** Qualquer outra requisição sem usuário autenticado (token vencido ou inválido, documentação). */
    ANONIMO_IP("anonimo-ip", TipoChave.IP, 300, Duration.ofMinutes(1), FalhaArmazem.LIBERAR,
            "Muitas requisições em pouco tempo."),
    /** Rede de proteção para qualquer requisição autenticada. */
    USUARIO("usuario", TipoChave.USUARIO, 1200, Duration.ofMinutes(1), FalhaArmazem.LIBERAR,
            "Muitas requisições em pouco tempo."),
    /** Importações e exportações de planilha, que pesam em CPU e memória. */
    USUARIO_PESADO("usuario-pesado", TipoChave.USUARIO, 30, Duration.ofMinutes(1), FalhaArmazem.LIBERAR,
            "Muitas importações ou exportações em pouco tempo."),
    /** Envio de arquivos (multipart). */
    UPLOAD("upload", TipoChave.USUARIO, 120, Duration.ofMinutes(1), FalhaArmazem.LIBERAR,
            "Muitos arquivos enviados em pouco tempo."),
    /** Mensagens à Bússola: cada uma consome o modelo de IA. */
    COPILOTO("copiloto", TipoChave.USUARIO, 20, Duration.ofMinutes(1), FalhaArmazem.LIBERAR,
            "Muitas mensagens para a Bússola em pouco tempo."),
    /**
     * Autocomplete e bootstrap de lookups. Herda {@code ces.lookup.rate-limit} (ligado e
     * 300 por minuto), que já estava ativo antes das demais políticas.
     */
    LOOKUP("lookup", TipoChave.USUARIO, 300, Duration.ofMinutes(1), FalhaArmazem.LIBERAR,
            "Muitas buscas em pouco tempo.");

    /** O que identifica quem consome o limite; define também o que pode aparecer em log. */
    public enum TipoChave { IP, USUARIO, CONTA }

    private final String nome;
    private final TipoChave tipoChave;
    private final long capacidadePadrao;
    private final Duration periodoPadrao;
    private final FalhaArmazem falhaPadrao;
    private final String mensagem;

    PoliticaRateLimit(String nome, TipoChave tipoChave, long capacidadePadrao, Duration periodoPadrao,
                      FalhaArmazem falhaPadrao, String mensagem) {
        this.nome = nome;
        this.tipoChave = tipoChave;
        this.capacidadePadrao = capacidadePadrao;
        this.periodoPadrao = periodoPadrao;
        this.falhaPadrao = falhaPadrao;
        this.mensagem = mensagem;
    }

    /** Nome estável, usado na configuração, nas métricas e nas chaves do Redis. */
    public String nome() {
        return nome;
    }

    public TipoChave tipoChave() {
        return tipoChave;
    }

    long capacidadePadrao() {
        return capacidadePadrao;
    }

    Duration periodoPadrao() {
        return periodoPadrao;
    }

    FalhaArmazem falhaPadrao() {
        return falhaPadrao;
    }

    /** Frase para a pessoa, sem termos técnicos; o tempo de espera é acrescentado na resposta. */
    public String mensagem() {
        return mensagem;
    }
}
