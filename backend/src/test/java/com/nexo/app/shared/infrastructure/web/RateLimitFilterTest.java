package com.nexo.app.shared.infrastructure.web;

import com.nexo.app.shared.infrastructure.lookup.LookupMetrics;
import com.nexo.app.shared.infrastructure.ratelimit.DecisaoRateLimit;
import com.nexo.app.shared.infrastructure.ratelimit.PoliticaRateLimit;
import com.nexo.app.shared.infrastructure.ratelimit.RateLimitExcedidoException;
import com.nexo.app.shared.infrastructure.ratelimit.RateLimiter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RateLimitFilterTest {

    private final RateLimiter limiter = mock(RateLimiter.class);
    private final LookupMetrics lookupMetrics = mock(LookupMetrics.class);
    private final HandlerExceptionResolver resolver = mock(HandlerExceptionResolver.class);
    private final RateLimitFilter filtro = new RateLimitFilter(limiter, lookupMetrics, resolver);

    @AfterEach
    void limparSeguranca() {
        SecurityContextHolder.clearContext();
    }

    private static MockHttpServletRequest requisicao(String metodo, String caminho) {
        MockHttpServletRequest request = new MockHttpServletRequest(metodo, "/api" + caminho);
        request.setContextPath("/api");
        request.setRemoteAddr("fd12::10");
        request.addHeader("X-Real-IP", "200.10.20.30");
        return request;
    }

    private static String autenticar() {
        String id = UUID.randomUUID().toString();
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(id, null, "ROLE_X"));
        return id;
    }

    private static DecisaoRateLimit liberada(PoliticaRateLimit politica) {
        return new DecisaoRateLimit(politica, DecisaoRateLimit.Resultado.LIBERADA, 0, Duration.ZERO, 0);
    }

    @Test
    void loginContaPorIpDoClienteEnaoPeloProxy() throws Exception {
        when(limiter.consumir(any(), any())).thenAnswer(i -> liberada(i.getArgument(0)));

        filtro.doFilter(requisicao("POST", "/v1/auth/login"), new MockHttpServletResponse(), new MockFilterChain());

        verify(limiter).consumir(PoliticaRateLimit.LOGIN_IP, "200.10.20.30");
    }

    @Test
    void escolheAPoliticaDeCadaRotaPublica() {
        assertThat(RateLimitFilter.verificacoes(requisicao("POST", "/v1/auth/refresh")))
                .extracting(RateLimitFilter.Verificacao::politica).containsExactly(PoliticaRateLimit.SESSAO_IP);
        assertThat(RateLimitFilter.verificacoes(requisicao("GET", "/v1/publico/educacao/verificacoes/ABC")))
                .extracting(RateLimitFilter.Verificacao::politica)
                .containsExactly(PoliticaRateLimit.VERIFICACAO_IP, PoliticaRateLimit.PUBLICO_IP);
        assertThat(RateLimitFilter.verificacoes(requisicao("POST", "/v1/publico/financeiro/decisoes/tok")))
                .extracting(RateLimitFilter.Verificacao::politica).containsExactly(PoliticaRateLimit.PUBLICO_IP);
        assertThat(RateLimitFilter.verificacoes(requisicao("POST", "/oauth/token")))
                .extracting(RateLimitFilter.Verificacao::politica).containsExactly(PoliticaRateLimit.OAUTH_IP);
        assertThat(RateLimitFilter.verificacoes(requisicao("GET", "/ws/info")))
                .extracting(RateLimitFilter.Verificacao::politica).containsExactly(PoliticaRateLimit.WEBSOCKET_IP);
        assertThat(RateLimitFilter.verificacoes(requisicao("GET", "/v1/rh/colaboradores")))
                .extracting(RateLimitFilter.Verificacao::politica).containsExactly(PoliticaRateLimit.ANONIMO_IP);
    }

    @Test
    void autenticadoContaPeloUsuarioNaPoliticaEspecificaENaGeral() {
        String usuario = autenticar();

        assertThat(RateLimitFilter.verificacoes(requisicao("GET", "/v1/rh/colaboradores/options")))
                .containsExactly(new RateLimitFilter.Verificacao(PoliticaRateLimit.LOOKUP, usuario),
                        new RateLimitFilter.Verificacao(PoliticaRateLimit.USUARIO, usuario));
        assertThat(RateLimitFilter.verificacoes(requisicao("POST", "/v1/assistente/conversas/abc/mensagens/stream")))
                .extracting(RateLimitFilter.Verificacao::politica)
                .containsExactly(PoliticaRateLimit.COPILOTO, PoliticaRateLimit.USUARIO);
        assertThat(RateLimitFilter.verificacoes(requisicao("POST", "/v1/rh/colaboradores/importar")))
                .extracting(RateLimitFilter.Verificacao::politica)
                .containsExactly(PoliticaRateLimit.USUARIO_PESADO, PoliticaRateLimit.USUARIO);
        assertThat(RateLimitFilter.verificacoes(requisicao("GET", "/v1/rh/colaboradores/importacoes/1")))
                .extracting(RateLimitFilter.Verificacao::politica).containsExactly(PoliticaRateLimit.USUARIO);
        assertThat(RateLimitFilter.verificacoes(requisicao("GET", "/v1/mcp-nao/qualquer")))
                .extracting(RateLimitFilter.Verificacao::politica).containsExactly(PoliticaRateLimit.USUARIO);
        assertThat(RateLimitFilter.verificacoes(requisicao("POST", "/mcp")))
                .containsExactly(new RateLimitFilter.Verificacao(PoliticaRateLimit.MCP, usuario));

        MockHttpServletRequest upload = requisicao("POST", "/v1/anexos");
        upload.setContentType("multipart/form-data; boundary=x");
        assertThat(RateLimitFilter.verificacoes(upload))
                .extracting(RateLimitFilter.Verificacao::politica)
                .containsExactly(PoliticaRateLimit.UPLOAD, PoliticaRateLimit.USUARIO);
    }

    @Test
    void probesEPreflightNaoPassamPeloLimite() throws Exception {
        filtro.doFilter(requisicao("GET", "/actuator/health"), new MockHttpServletResponse(), new MockFilterChain());
        filtro.doFilter(requisicao("GET", "/internal/observability/probe"), new MockHttpServletResponse(), new MockFilterChain());
        filtro.doFilter(requisicao("OPTIONS", "/v1/auth/login"), new MockHttpServletResponse(), new MockFilterChain());

        verifyNoInteractions(limiter);
    }

    @Test
    void aoBarrarNaoChamaOControllerEResolveComo429() throws Exception {
        autenticar();
        DecisaoRateLimit barrada = new DecisaoRateLimit(PoliticaRateLimit.LOOKUP, DecisaoRateLimit.Resultado.BLOQUEADA,
                300, Duration.ofMinutes(1), 7);
        when(limiter.consumir(eq(PoliticaRateLimit.LOOKUP), any())).thenReturn(barrada);
        MockHttpServletRequest request = requisicao("GET", "/v1/lookups/bootstrap");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filtro.doFilter(request, response, chain);

        assertThat(chain.getRequest()).isNull();
        verify(lookupMetrics).recordRateLimit("lookup", "bootstrap");
        verify(resolver).resolveException(eq(request), eq(response), eq(null),
                argThat(e -> e instanceof RateLimitExcedidoException r && r.getRetryAfter() == 7));
        verify(limiter, never()).consumir(eq(PoliticaRateLimit.USUARIO), any());
    }

    @Test
    void emModoSombraARequisicaoSegue() throws Exception {
        when(limiter.consumir(any(), any())).thenAnswer(i -> new DecisaoRateLimit(i.getArgument(0),
                DecisaoRateLimit.Resultado.SOMBRA, 30, Duration.ofMinutes(1), 10));
        MockFilterChain chain = new MockFilterChain();

        filtro.doFilter(requisicao("POST", "/v1/auth/login"), new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isNotNull();
        verifyNoInteractions(resolver);
    }
}
