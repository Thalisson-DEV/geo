package com.nexo.app.shared.infrastructure.web;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class ClienteIpTest {

    private static MockHttpServletRequest vindoDe(String parTcp) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/qualquer");
        request.setRemoteAddr(parTcp);
        return request;
    }

    @Test
    void usaOXRealIpGravadoPelaBordaQuandoOParTcpEhONginxDaRedePrivada() {
        MockHttpServletRequest request = vindoDe("fd12:3456::7");
        request.addHeader("X-Real-IP", "200.150.10.20");
        request.addHeader("X-Forwarded-For", "1.1.1.1, 200.150.10.20, 10.0.0.5");

        assertThat(ClienteIp.de(request)).isEqualTo("200.150.10.20");
    }

    @Test
    void nuncaUsaOPrimeiroDoXForwardedForQueOClienteControla() {
        MockHttpServletRequest request = vindoDe("fd12:3456::7");
        // Sem X-Real-IP útil: lê da direita para a esquerda e para no primeiro IP público.
        request.addHeader("X-Real-IP", "100.64.0.9");
        request.addHeader("X-Forwarded-For", "9.9.9.9, 177.20.30.40, 100.64.0.9");

        assertThat(ClienteIp.de(request)).isEqualTo("177.20.30.40");
    }

    @Test
    void ignoraHeadersQuandoQuemConectaNaoEhProxyDaInfraestrutura() {
        MockHttpServletRequest request = vindoDe("177.20.30.40");
        request.addHeader("X-Real-IP", "8.8.8.8");
        request.addHeader("X-Forwarded-For", "8.8.4.4");

        assertThat(ClienteIp.de(request)).isEqualTo("177.20.30.40");
    }

    @Test
    void semHeadersFicaComOParTcp() {
        assertThat(ClienteIp.de(vindoDe("127.0.0.1"))).isEqualTo("127.0.0.1");
    }

    @Test
    void textoQueNaoEhIpInterrompeALeituraEVoltaParaOParTcp() {
        MockHttpServletRequest request = vindoDe("10.1.2.3");
        request.addHeader("X-Real-IP", "exemplo.com");
        request.addHeader("X-Forwarded-For", "8.8.8.8, unknown, 10.0.0.1");

        assertThat(ClienteIp.de(request)).isEqualTo("10.1.2.3");
    }

    @Test
    void interpretaSoIpsLiteraisSemConsultarDns() {
        assertThat(ClienteIp.literal("localhost")).isNull();
        assertThat(ClienteIp.literal("300.1.1.1")).isNull();
        assertThat(ClienteIp.literal(" 200.1.2.3 ")).isNotNull();
        assertThat(ClienteIp.literal("[2804:14c::1]")).isNotNull();
        assertThat(ClienteIp.literal("1".repeat(60))).isNull();
    }

    @Test
    void reconheceAsFaixasPrivadasComoProxyConfiavel() {
        assertThat(ClienteIp.proxyConfiavel(ClienteIp.literal("10.0.0.1"))).isTrue();
        assertThat(ClienteIp.proxyConfiavel(ClienteIp.literal("172.16.5.5"))).isTrue();
        assertThat(ClienteIp.proxyConfiavel(ClienteIp.literal("192.168.0.10"))).isTrue();
        assertThat(ClienteIp.proxyConfiavel(ClienteIp.literal("100.100.1.1"))).isTrue();
        assertThat(ClienteIp.proxyConfiavel(ClienteIp.literal("fd12::10"))).isTrue();
        assertThat(ClienteIp.proxyConfiavel(ClienteIp.literal("::1"))).isTrue();
        assertThat(ClienteIp.proxyConfiavel(ClienteIp.literal("100.128.0.1"))).isFalse();
        assertThat(ClienteIp.proxyConfiavel(ClienteIp.literal("200.150.10.20"))).isFalse();
        assertThat(ClienteIp.proxyConfiavel(ClienteIp.literal("2804:14c::1"))).isFalse();
    }
}
