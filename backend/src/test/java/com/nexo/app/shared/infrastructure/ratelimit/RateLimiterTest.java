package com.nexo.app.shared.infrastructure.ratelimit;

import com.nexo.app.shared.infrastructure.lookup.LookupRateLimitProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimiterTest {

    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final AtomicLong relogio = new AtomicLong(-5_000_000_000L); // nanoTime pode ser negativo

    private RateLimiter limiter(ModoRateLimit modo, long capacidade, ArmazemBuckets distribuido) {
        var ajuste = new RateLimitProperties.Politica(capacidade, Duration.ofMinutes(1), modo, null);
        var propriedades = new RateLimitProperties(true, ModoRateLimit.SOMBRA, null, Duration.ofSeconds(30), null,
                Map.of("login-ip", ajuste, "copiloto", ajuste));
        return new RateLimiter(propriedades, new LookupRateLimitProperties(), distribuido,
                new ArmazemBucketsLocal(1_000, relogio::get), new RateLimitMetricas(registry), relogio::get);
    }

    private ArmazemBucketsLocal distribuidoEmMemoria() {
        return new ArmazemBucketsLocal(1_000);
    }

    @Test
    void ativoBarraQuemPassaDaCapacidadeEInformaQuantoEsperar() {
        RateLimiter limiter = limiter(ModoRateLimit.ATIVO, 2, distribuidoEmMemoria());

        assertThat(limiter.consumir(PoliticaRateLimit.COPILOTO, "u1").bloqueada()).isFalse();
        assertThat(limiter.consumir(PoliticaRateLimit.COPILOTO, "u1").bloqueada()).isFalse();
        DecisaoRateLimit terceira = limiter.consumir(PoliticaRateLimit.COPILOTO, "u1");

        assertThat(terceira.bloqueada()).isTrue();
        assertThat(terceira.retryAfterSegundos()).isBetween(1L, 31L);
        assertThat(terceira.capacidade()).isEqualTo(2);
        assertThat(registry.counter("ces.rate_limit.excedido", "politica", "copiloto", "modo", "ativo").count())
                .isEqualTo(1);
    }

    @Test
    void cadaChaveTemSeuProprioBalde() {
        RateLimiter limiter = limiter(ModoRateLimit.ATIVO, 1, distribuidoEmMemoria());

        assertThat(limiter.consumir(PoliticaRateLimit.COPILOTO, "u1").bloqueada()).isFalse();
        assertThat(limiter.consumir(PoliticaRateLimit.COPILOTO, "u2").bloqueada()).isFalse();
        assertThat(limiter.consumir(PoliticaRateLimit.COPILOTO, "u1").bloqueada()).isTrue();
    }

    @Test
    void sombraNuncaBarraMasMedeQuemSeriaBarrado() {
        RateLimiter limiter = limiter(ModoRateLimit.SOMBRA, 1, distribuidoEmMemoria());

        limiter.consumir(PoliticaRateLimit.COPILOTO, "u1");
        DecisaoRateLimit segunda = limiter.consumir(PoliticaRateLimit.COPILOTO, "u1");

        assertThat(segunda.bloqueada()).isFalse();
        assertThat(segunda.resultado()).isEqualTo(DecisaoRateLimit.Resultado.SOMBRA);
        assertThat(registry.counter("ces.rate_limit.excedido", "politica", "copiloto", "modo", "sombra").count())
                .isEqualTo(1);
    }

    @Test
    void desligadoOuSemChaveNaoContaNada() {
        AtomicInteger chamadas = new AtomicInteger();
        ArmazemBuckets contador = new ArmazemBuckets() {
            public Consumo consumir(String chave, LimiteRateLimit limite) { chamadas.incrementAndGet(); return Consumo.de(true, 0); }
            public Consumo estimar(String chave, LimiteRateLimit limite) { chamadas.incrementAndGet(); return Consumo.de(true, 0); }
        };
        RateLimiter desligado = limiter(ModoRateLimit.DESLIGADO, 1, contador);

        desligado.consumir(PoliticaRateLimit.COPILOTO, "u1");
        limiter(ModoRateLimit.ATIVO, 1, contador).consumir(PoliticaRateLimit.COPILOTO, " ");

        assertThat(chamadas).hasValue(0);
    }

    @Test
    void consultarNaoConsomeFicha() {
        RateLimiter limiter = limiter(ModoRateLimit.ATIVO, 1, distribuidoEmMemoria());

        for (int i = 0; i < 5; i++) {
            assertThat(limiter.consultar(PoliticaRateLimit.COPILOTO, "u1").bloqueada()).isFalse();
        }
        limiter.consumir(PoliticaRateLimit.COPILOTO, "u1");
        assertThat(limiter.consultar(PoliticaRateLimit.COPILOTO, "u1").bloqueada()).isTrue();
    }

    @Test
    void semRedisPoliticaLiberarDeixaPassarEPoliticaLocalContaNaMemoria() {
        AtomicInteger tentativas = new AtomicInteger();
        ArmazemBuckets foraDoAr = new ArmazemBuckets() {
            public Consumo consumir(String chave, LimiteRateLimit limite) { tentativas.incrementAndGet(); throw new IllegalStateException("redis fora"); }
            public Consumo estimar(String chave, LimiteRateLimit limite) { tentativas.incrementAndGet(); throw new IllegalStateException("redis fora"); }
        };
        var propriedades = new RateLimitProperties(true, ModoRateLimit.ATIVO, null, Duration.ofSeconds(30), null,
                Map.of("login-ip", new RateLimitProperties.Politica(1L, Duration.ofMinutes(1), null, FalhaArmazem.LOCAL),
                        "copiloto", new RateLimitProperties.Politica(1L, Duration.ofMinutes(1), null, FalhaArmazem.LIBERAR)));
        RateLimiter limiter = new RateLimiter(propriedades, new LookupRateLimitProperties(), foraDoAr,
                new ArmazemBucketsLocal(1_000, relogio::get), new RateLimitMetricas(registry), relogio::get);

        assertThat(limiter.consumir(PoliticaRateLimit.COPILOTO, "u1").bloqueada()).isFalse();
        assertThat(limiter.consumir(PoliticaRateLimit.COPILOTO, "u1").bloqueada()).isFalse();
        assertThat(limiter.consumir(PoliticaRateLimit.LOGIN_IP, "1.2.3.4").bloqueada()).isFalse();
        assertThat(limiter.consumir(PoliticaRateLimit.LOGIN_IP, "1.2.3.4").bloqueada()).isTrue();

        // Depois da primeira falha o Redis fica em pausa: não se paga o timeout a cada requisição.
        assertThat(tentativas).hasValue(1);
        relogio.addAndGet(Duration.ofSeconds(31).toNanos());
        limiter.consumir(PoliticaRateLimit.COPILOTO, "u1");
        assertThat(tentativas).hasValue(2);
        assertThat(registry.counter("ces.rate_limit.falha_armazem", "politica", "login-ip", "contingencia", "local").count())
                .isEqualTo(2);
    }

    @Test
    void lookupHerdaAConfiguracaoQueJaEstavaAtiva() {
        var propriedades = RateLimitProperties.padrao();
        RateLimiter ligado = new RateLimiter(propriedades, new LookupRateLimitProperties(true, 120, Duration.ofSeconds(30)),
                distribuidoEmMemoria(), new ArmazemBucketsLocal(1_000), new RateLimitMetricas(registry), relogio::get);
        RateLimiter desligado = new RateLimiter(propriedades, new LookupRateLimitProperties(false, 120, Duration.ofSeconds(30)),
                distribuidoEmMemoria(), new ArmazemBucketsLocal(1_000), new RateLimitMetricas(registry), relogio::get);

        assertThat(ligado.limite(PoliticaRateLimit.LOOKUP).modo()).isEqualTo(ModoRateLimit.ATIVO);
        assertThat(ligado.limite(PoliticaRateLimit.LOOKUP).capacidade()).isEqualTo(120);
        assertThat(ligado.limite(PoliticaRateLimit.LOOKUP).periodo()).isEqualTo(Duration.ofSeconds(30));
        assertThat(desligado.modo(PoliticaRateLimit.LOOKUP)).isEqualTo(ModoRateLimit.DESLIGADO);
        // As demais nascem em sombra.
        assertThat(ligado.modo(PoliticaRateLimit.LOGIN_IP)).isEqualTo(ModoRateLimit.SOMBRA);
        assertThat(ligado.limite(PoliticaRateLimit.LOGIN_IP).capacidade()).isEqualTo(30);
    }

    @Test
    void habilitadoFalseDesligaTudoInclusiveOLookup() {
        var propriedades = new RateLimitProperties(false, ModoRateLimit.ATIVO, null, null, null, null);
        RateLimiter limiter = new RateLimiter(propriedades, new LookupRateLimitProperties(true, 1, Duration.ofMinutes(1)),
                distribuidoEmMemoria(), new ArmazemBucketsLocal(1_000), new RateLimitMetricas(registry), relogio::get);

        limiter.consumir(PoliticaRateLimit.LOOKUP, "u1");
        assertThat(limiter.consumir(PoliticaRateLimit.LOOKUP, "u1").bloqueada()).isFalse();
        assertThat(limiter.modo(PoliticaRateLimit.LOOKUP)).isEqualTo(ModoRateLimit.DESLIGADO);
    }

    @Test
    void chaveVaiResumidaNuncaEmClaro() {
        String resumo = RateLimiter.resumo("USR123456");

        assertThat(resumo).hasSize(32).doesNotContain("USR123456").isEqualTo(RateLimiter.resumo(" USR123456 "));
    }
}
