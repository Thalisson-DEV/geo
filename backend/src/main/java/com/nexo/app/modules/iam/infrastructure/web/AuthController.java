package com.nexo.app.modules.iam.infrastructure.web;

import com.nexo.app.modules.iam.application.dto.AlterarSenhaRequest;
import com.nexo.app.modules.iam.application.dto.LoginRequest;
import com.nexo.app.modules.iam.application.dto.TokenResponse;
import com.nexo.app.modules.iam.application.usecases.AlterarSenhaUseCase;
import com.nexo.app.modules.iam.application.usecases.AutenticarUseCase;
import com.nexo.app.modules.iam.application.usecases.AutenticarUseCase.Credenciais;
import com.nexo.app.modules.iam.application.usecases.SessaoAutenticacaoUseCases;
import com.nexo.app.modules.iam.doc.AuthControllerDoc;
import com.nexo.app.shared.domain.exception.SessaoInvalidaException;
import com.nexo.app.shared.infrastructure.web.ClienteIp;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Arrays;

@RestController
@RequestMapping("/v1/auth")
@RequiredArgsConstructor
public class AuthController implements AuthControllerDoc {

    /**
     * Cookie do refresh token. HttpOnly para o JavaScript nunca o enxergar (XSS não o
     * rouba), SameSite=Strict e restrito ao caminho /v1/auth: só viaja para renovar e sair.
     */
    static final String COOKIE_SESSAO = "geo_sessao";

    /**
     * Nome do cookie antes da troca de nome do produto. É lido na renovação e no logout e sempre
     * expirado na resposta, para ninguém ser deslogado na atualização. Remover a leitura 30 dias
     * depois do Release 0 (prazo máximo do refresh token).
     */
    static final String COOKIE_SESSAO_LEGADO = "ces_sessao"; // renomear-geo: manter (cookie já gravado nos navegadores)

    private final AutenticarUseCase autenticarUseCase;
    private final SessaoAutenticacaoUseCases sessoes;
    private final AlterarSenhaUseCase alterarSenhaUseCase;

    @Value("${geo.security.sessao.cookie-seguro:true}")
    private boolean cookieSeguro;

    @Override
    @PostMapping("/login")
    public ResponseEntity<TokenResponse> login(@RequestBody @Valid LoginRequest request, HttpServletRequest http) {
        return comCookie(autenticarUseCase.login(request, http.getHeader(HttpHeaders.USER_AGENT), ClienteIp.de(http)), http);
    }

    @Override
    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> renovar(
            @CookieValue(name = COOKIE_SESSAO, required = false) String refreshToken,
            HttpServletRequest http) {
        refreshToken = comLegado(refreshToken, http);
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new SessaoInvalidaException("Nenhuma sessão neste aparelho. Entre novamente.");
        }
        return comCookie(autenticarUseCase.renovar(refreshToken), http);
    }

    @Override
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = COOKIE_SESSAO, required = false) String refreshToken,
            HttpServletRequest http) {
        refreshToken = comLegado(refreshToken, http);
        if (refreshToken != null && !refreshToken.isBlank()) {
            sessoes.encerrar(refreshToken);
        }
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO, http).toString())
                .header(HttpHeaders.SET_COOKIE, expirarLegado(http).toString())
                .build();
    }

    @Override
    @PostMapping("/alterar-senha")
    public ResponseEntity<Void> alterarSenha(@RequestBody @Valid AlterarSenhaRequest request) {
        alterarSenhaUseCase.executar(request);
        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<TokenResponse> comCookie(Credenciais credenciais, HttpServletRequest http) {
        var validade = Duration.between(OffsetDateTime.now(), credenciais.sessaoExpiraEm());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie(credenciais.refreshToken(), validade, http).toString())
                .header(HttpHeaders.SET_COOKIE, expirarLegado(http).toString())
                .body(new TokenResponse(credenciais.tokenAcesso(), credenciais.sessaoExpiraEm()));
    }

    /** Usa o cookie novo; sem ele, o de nome antigo. */
    static String comLegado(String atual, HttpServletRequest http) {
        if (atual != null && !atual.isBlank()) {
            return atual;
        }
        Cookie[] cookies = http.getCookies();
        if (cookies == null) {
            return atual;
        }
        return Arrays.stream(cookies)
                .filter(c -> COOKIE_SESSAO_LEGADO.equals(c.getName()))
                .map(Cookie::getValue)
                .filter(v -> v != null && !v.isBlank())
                .findFirst()
                .orElse(atual);
    }

    private ResponseCookie expirarLegado(HttpServletRequest http) {
        return montar(COOKIE_SESSAO_LEGADO, "", Duration.ZERO, http);
    }

    private ResponseCookie cookie(String valor, Duration validade, HttpServletRequest http) {
        return montar(COOKIE_SESSAO, valor, validade, http);
    }

    private ResponseCookie montar(String nome, String valor, Duration validade, HttpServletRequest http) {
        return ResponseCookie.from(nome, valor)
                .httpOnly(true)
                .secure(cookieSeguro)
                .sameSite("Strict")
                .path(http.getContextPath() + "/v1/auth")
                .maxAge(validade)
                .build();
    }
}
