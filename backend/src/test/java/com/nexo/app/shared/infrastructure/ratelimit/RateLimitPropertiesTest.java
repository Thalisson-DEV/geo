package com.nexo.app.shared.infrastructure.ratelimit;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RateLimitPropertiesTest {

    @Test
    void padroesSeguros() {
        RateLimitProperties propriedades = RateLimitProperties.padrao();

        assertThat(propriedades.habilitado()).isTrue();
        assertThat(propriedades.modoPadrao()).isEqualTo(ModoRateLimit.SOMBRA);
        assertThat(propriedades.timeoutArmazem()).isEqualTo(Duration.ofMillis(500));
        assertThat(propriedades.pausaAposFalha()).isEqualTo(Duration.ofSeconds(30));
        assertThat(propriedades.politicas()).isEmpty();
    }

    @Test
    void vinculaAConfiguracaoDoYamlPeloConstrutorDoRecord() {
        var fonte = new org.springframework.boot.context.properties.source.MapConfigurationPropertySource(Map.of(
                "ces.rate-limit.modo-padrao", "ATIVO",
                "ces.rate-limit.timeout-armazem", "PT0.2S",
                "ces.rate-limit.politicas.login-ip.capacidade", "5",
                "ces.rate-limit.politicas.login-ip.periodo", "PT2M",
                "ces.rate-limit.politicas.login-ip.modo", "SOMBRA",
                "ces.rate-limit.politicas.login-ip.falha-armazem", "LOCAL"));

        RateLimitProperties propriedades = new org.springframework.boot.context.properties.bind.Binder(fonte)
                .bind("ces.rate-limit", RateLimitProperties.class).get();

        assertThat(propriedades.modoPadrao()).isEqualTo(ModoRateLimit.ATIVO);
        assertThat(propriedades.timeoutArmazem()).isEqualTo(Duration.ofMillis(200));
        assertThat(propriedades.politicas()).containsEntry("login-ip",
                new RateLimitProperties.Politica(5L, Duration.ofMinutes(2), ModoRateLimit.SOMBRA, FalhaArmazem.LOCAL));
    }

    @Test
    void recusaPoliticaComNomeDesconhecido() {
        assertThatThrownBy(() -> new RateLimitProperties(null, null, null, null, null,
                Map.of("login", new RateLimitProperties.Politica(1L, null, null, null))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("login");
    }

    @Test
    void recusaValoresNaoPositivos() {
        assertThatThrownBy(() -> new RateLimitProperties.Politica(0L, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RateLimitProperties.Politica(1L, Duration.ZERO, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RateLimitProperties(null, null, Duration.ZERO, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void nomesDasPoliticasSaoUnicos() {
        var nomes = java.util.Arrays.stream(PoliticaRateLimit.values()).map(PoliticaRateLimit::nome).toList();

        assertThat(nomes).doesNotHaveDuplicates();
    }
}
