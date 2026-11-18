package com.nexo.app.shared.infrastructure.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

class PrefixoConfiguracaoLegadoGuardTest {

    private final PrefixoConfiguracaoLegadoGuard guard = new PrefixoConfiguracaoLegadoGuard();

    @Test
    void recusaVariavelDeAmbienteAntigaEApontaANova() {
        StandardEnvironment ambiente = ambienteCom(Map.of());
        ambiente.getPropertySources().addFirst(new SystemEnvironmentPropertySource("env-teste",
                Map.of(PrefixoConfiguracaoLegadoGuard.PREFIXO_VARIAVEL_LEGADO + "EMAIL_PROVEDOR", "NENHUM")));

        assertThatThrownBy(() -> guard.postProcessEnvironment(ambiente, null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GEO_EMAIL_PROVEDOR");
    }

    @Test
    void recusaPropriedadeAntiga() {
        StandardEnvironment ambiente = ambienteCom(Map.of(PrefixoConfiguracaoLegadoGuard.PREFIXO_PROPRIEDADE_LEGADO + "r2.bucket", "anexos"));

        assertThatThrownBy(() -> guard.postProcessEnvironment(ambiente, null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("geo.r2.bucket");
    }

    @Test
    void sobeComOPrefixoNovoEComPalavrasQueComecamComCes() {
        StandardEnvironment ambiente = ambienteCom(Map.of(
                "geo.email.provedor", "NENHUM",
                "cessao.ativa", "true",
                "CESTO_PADRAO", "1"));

        guard.postProcessEnvironment(ambiente, null);

        assertThat(PrefixoConfiguracaoLegadoGuard.chavesLegadas(ambiente)).isEmpty();
    }

    private static StandardEnvironment ambienteCom(Map<String, Object> propriedades) {
        StandardEnvironment ambiente = new StandardEnvironment();
        ambiente.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        ambiente.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        ambiente.getPropertySources().addFirst(new MapPropertySource("teste", propriedades));
        return ambiente;
    }
}
