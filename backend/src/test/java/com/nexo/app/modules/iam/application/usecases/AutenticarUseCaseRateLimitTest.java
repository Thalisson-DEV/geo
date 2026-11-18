package com.nexo.app.modules.iam.application.usecases;

import com.nexo.app.modules.estoque.EstoqueApi;
import com.nexo.app.modules.iam.application.dto.LoginRequest;
import com.nexo.app.modules.iam.infrastructure.persistence.UsuarioRepository;
import com.nexo.app.modules.iam.infrastructure.security.PerfilPermissaoCacheService;
import com.nexo.app.modules.rh.ColaboradorApi;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.shared.infrastructure.ratelimit.DecisaoRateLimit;
import com.nexo.app.shared.infrastructure.ratelimit.PoliticaRateLimit;
import com.nexo.app.shared.infrastructure.ratelimit.RateLimitExcedidoException;
import com.nexo.app.shared.infrastructure.ratelimit.RateLimiter;
import com.nexo.app.shared.infrastructure.security.TokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AutenticarUseCaseRateLimitTest {

    private final AuthenticationManager manager = mock(AuthenticationManager.class);
    private final RateLimiter rateLimiter = mock(RateLimiter.class);
    private AutenticarUseCase useCase;

    @BeforeEach
    void montar() {
        useCase = new AutenticarUseCase(manager, mock(TokenService.class), mock(SessaoAutenticacaoUseCases.class),
                mock(UsuarioRepository.class), mock(PerfilPermissaoCacheService.class), mock(ColaboradorApi.class),
                mock(EquipeApi.class), mock(EstoqueApi.class), rateLimiter);
        when(rateLimiter.consultar(any(), any())).thenAnswer(i -> liberada(i.getArgument(0)));
        when(rateLimiter.consumir(any(), any())).thenAnswer(i -> liberada(i.getArgument(0)));
    }

    private static DecisaoRateLimit liberada(PoliticaRateLimit politica) {
        return new DecisaoRateLimit(politica, DecisaoRateLimit.Resultado.LIBERADA, 0, Duration.ZERO, 0);
    }

    @Test
    void senhaErradaContaPorLoginNoIpEPorLoginEmQualquerIp() {
        when(manager.authenticate(any())).thenThrow(new BadCredentialsException("senha errada"));

        assertThatThrownBy(() -> useCase.login(new LoginRequest(" usr123456 ", "x"), "navegador", "200.1.2.3"))
                .isInstanceOf(BadCredentialsException.class);

        verify(rateLimiter).consumir(PoliticaRateLimit.LOGIN_FALHAS_CONTA_IP, "200.1.2.3|USR123456");
        verify(rateLimiter).consumir(PoliticaRateLimit.LOGIN_FALHAS_CONTA, "USR123456");
    }

    @Test
    void comLimiteDeSenhasErradasEsgotadoNemConfereASenha() {
        when(rateLimiter.consultar(eq(PoliticaRateLimit.LOGIN_FALHAS_CONTA_IP), any()))
                .thenReturn(new DecisaoRateLimit(PoliticaRateLimit.LOGIN_FALHAS_CONTA_IP,
                        DecisaoRateLimit.Resultado.BLOQUEADA, 10, Duration.ofMinutes(15), 120));

        assertThatThrownBy(() -> useCase.login(new LoginRequest("USR123456", "x"), "navegador", "200.1.2.3"))
                .isInstanceOf(RateLimitExcedidoException.class);

        verifyNoInteractions(manager);
        verify(rateLimiter, never()).consumir(any(), any());
    }
}
