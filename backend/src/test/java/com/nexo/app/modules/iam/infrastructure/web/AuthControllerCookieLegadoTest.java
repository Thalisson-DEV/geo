package com.nexo.app.modules.iam.infrastructure.web;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class AuthControllerCookieLegadoTest {

    @Test
    void usaOCookieNovoQuandoExiste() {
        MockHttpServletRequest http = new MockHttpServletRequest();
        http.setCookies(new Cookie(AuthController.COOKIE_SESSAO_LEGADO, "antigo"));

        assertThat(AuthController.comLegado("novo", http)).isEqualTo("novo");
    }

    @Test
    void semOCookieNovoUsaODeNomeAntigo() {
        MockHttpServletRequest http = new MockHttpServletRequest();
        http.setCookies(new Cookie(AuthController.COOKIE_SESSAO_LEGADO, "refresh-antigo"));

        assertThat(AuthController.comLegado(null, http)).isEqualTo("refresh-antigo");
    }

    @Test
    void semNenhumCookieContinuaSemSessao() {
        assertThat(AuthController.comLegado(null, new MockHttpServletRequest())).isNull();
    }
}
