package com.nexo.app.shared.infrastructure.web;

import com.nexo.app.shared.infrastructure.lookup.LookupMetrics;
import com.nexo.app.shared.infrastructure.ratelimit.DecisaoRateLimit;
import com.nexo.app.shared.infrastructure.ratelimit.PoliticaRateLimit;
import com.nexo.app.shared.infrastructure.ratelimit.RateLimitExcedidoException;
import com.nexo.app.shared.infrastructure.ratelimit.RateLimiter;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NonNull;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Aplica as políticas de {@link PoliticaRateLimit} por rota. Fica logo depois do
 * {@code SecurityFilter}: as rotas públicas contam por IP, e as autenticadas pelo usuário,
 * que nesse ponto já é conhecido. O limite por login (senha errada) não está aqui, porque
 * depende do corpo da requisição; ele fica no caso de uso de autenticação.
 *
 * <p>Uma requisição pode cair em mais de uma política (a específica e a geral do usuário);
 * basta uma barrar.</p>
 */
@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Pattern COPILOTO_MENSAGEM =
            Pattern.compile("^/v1/assistente/conversas/[^/]+/mensagens/stream$");
    private static final Set<String> SEGMENTOS_PESADOS = Set.of("importar", "confirmar-importacao", "exportar");
    private static final Set<String> METODOS_COM_CORPO = Set.of("POST", "PUT", "PATCH");

    private final RateLimiter limiter;
    private final LookupMetrics lookupMetrics;
    private final HandlerExceptionResolver exceptionResolver;

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true; // preflight do CORS não carrega credencial nem chega a um controller
        }
        String caminho = caminho(request);
        // Probes do Railway e da observabilidade não podem ser barrados.
        return caminho.startsWith("/actuator/") || caminho.equals("/actuator")
                || caminho.startsWith("/internal/observability/");
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {
        for (Verificacao verificacao : verificacoes(request)) {
            DecisaoRateLimit decisao = limiter.consumir(verificacao.politica(), verificacao.chave());
            if (decisao.bloqueada()) {
                if (verificacao.politica() == PoliticaRateLimit.LOOKUP) {
                    lookupMetrics.recordRateLimit("lookup", caminho(request).endsWith("/lookups/bootstrap")
                            ? "bootstrap" : "options");
                }
                exceptionResolver.resolveException(request, response, null, new RateLimitExcedidoException(decisao));
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    record Verificacao(PoliticaRateLimit politica, String chave) {
    }

    /** Políticas da requisição, da mais específica para a mais geral. */
    static List<Verificacao> verificacoes(HttpServletRequest request) {
        String metodo = request.getMethod().toUpperCase(Locale.ROOT);
        String caminho = caminho(request);
        String usuario = usuario();
        List<Verificacao> lista = new ArrayList<>(2);

        if (caminho.equals("/v1/auth/login") && metodo.equals("POST")) {
            lista.add(porIp(PoliticaRateLimit.LOGIN_IP, request));
            return lista;
        }
        if ((caminho.equals("/v1/auth/refresh") || caminho.equals("/v1/auth/logout")) && metodo.equals("POST")) {
            lista.add(porIp(PoliticaRateLimit.SESSAO_IP, request));
            return lista;
        }
        if (caminho.startsWith("/v1/publico/")) {
            if (caminho.startsWith("/v1/publico/educacao/verificacoes/")) {
                lista.add(porIp(PoliticaRateLimit.VERIFICACAO_IP, request));
            }
            lista.add(porIp(PoliticaRateLimit.PUBLICO_IP, request));
            return lista;
        }
        if (caminho.startsWith("/oauth/")) {
            lista.add(porIp(PoliticaRateLimit.OAUTH_IP, request));
            return lista;
        }
        if (caminho.equals("/mcp") || caminho.startsWith("/mcp/")) {
            lista.add(usuario != null
                    ? new Verificacao(PoliticaRateLimit.MCP, usuario)
                    : porIp(PoliticaRateLimit.ANONIMO_IP, request));
            return lista;
        }
        if (caminho.equals("/ws") || caminho.startsWith("/ws/")) {
            lista.add(porIp(PoliticaRateLimit.WEBSOCKET_IP, request));
            return lista;
        }
        if (usuario == null) {
            lista.add(porIp(PoliticaRateLimit.ANONIMO_IP, request));
            return lista;
        }

        PoliticaRateLimit especifica = especifica(metodo, caminho, request.getContentType());
        if (especifica != null) {
            lista.add(new Verificacao(especifica, usuario));
        }
        lista.add(new Verificacao(PoliticaRateLimit.USUARIO, usuario));
        return lista;
    }

    private static PoliticaRateLimit especifica(String metodo, String caminho, String contentType) {
        if (metodo.equals("GET") && (caminho.endsWith("/options") || caminho.endsWith("/lookups/bootstrap"))) {
            return PoliticaRateLimit.LOOKUP;
        }
        if (metodo.equals("POST") && COPILOTO_MENSAGEM.matcher(caminho).matches()) {
            return PoliticaRateLimit.COPILOTO;
        }
        for (String segmento : caminho.split("/")) {
            if (SEGMENTOS_PESADOS.contains(segmento)) {
                return PoliticaRateLimit.USUARIO_PESADO;
            }
        }
        if (METODOS_COM_CORPO.contains(metodo) && contentType != null
                && contentType.toLowerCase(Locale.ROOT).startsWith("multipart/")) {
            return PoliticaRateLimit.UPLOAD;
        }
        return null;
    }

    private static Verificacao porIp(PoliticaRateLimit politica, HttpServletRequest request) {
        return new Verificacao(politica, ClienteIp.de(request));
    }

    /** Caminho sem o context-path ({@code /api}), como os controllers o declaram. */
    static String caminho(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contexto = request.getContextPath();
        if (uri == null) {
            return "";
        }
        return contexto != null && !contexto.isEmpty() && uri.startsWith(contexto)
                ? uri.substring(contexto.length())
                : uri;
    }

    private static String usuario() {
        UUID id = SecurityUtils.getUsuarioLogadoId();
        if (id != null) {
            return id.toString();
        }
        var autenticacao = SecurityContextHolder.getContext().getAuthentication();
        if (autenticacao == null || !autenticacao.isAuthenticated()
                || "anonymousUser".equals(autenticacao.getName())
                || autenticacao.getName() == null || autenticacao.getName().isBlank()) {
            return null;
        }
        return autenticacao.getName();
    }
}
