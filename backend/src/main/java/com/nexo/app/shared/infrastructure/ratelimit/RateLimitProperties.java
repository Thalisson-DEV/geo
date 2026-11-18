package com.nexo.app.shared.infrastructure.ratelimit;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Map;

/**
 * Configuração de {@code ces.rate-limit}. Tudo é opcional: o que faltar usa o padrão da
 * {@link PoliticaRateLimit} e do próprio record.
 *
 * @param habilitado      desliga todas as políticas de uma vez (inclusive a de lookup)
 * @param modoPadrao      modo das políticas que não definem o seu; nasce em {@code SOMBRA}
 * @param timeoutArmazem  quanto esperar o Redis antes de tratar como indisponível
 * @param pausaAposFalha  por quanto tempo deixar de tentar o Redis depois de uma falha
 * @param maxChavesLocais teto de contadores guardados na memória quando o Redis está fora
 * @param politicas       ajustes por política, pelo nome (ex.: {@code login-ip})
 */
@ConfigurationProperties(prefix = "ces.rate-limit")
public record RateLimitProperties(
        Boolean habilitado,
        ModoRateLimit modoPadrao,
        Duration timeoutArmazem,
        Duration pausaAposFalha,
        Integer maxChavesLocais,
        Map<String, Politica> politicas) {

    public RateLimitProperties {
        habilitado = habilitado == null || habilitado;
        modoPadrao = modoPadrao == null ? ModoRateLimit.SOMBRA : modoPadrao;
        timeoutArmazem = positivo(timeoutArmazem, Duration.ofMillis(500), "timeout-armazem");
        pausaAposFalha = positivo(pausaAposFalha, Duration.ofSeconds(30), "pausa-apos-falha");
        maxChavesLocais = maxChavesLocais == null ? 50_000 : maxChavesLocais;
        if (maxChavesLocais < 100) {
            throw new IllegalArgumentException("ces.rate-limit.max-chaves-locais deve ser pelo menos 100");
        }
        politicas = politicas == null ? Map.of() : Map.copyOf(politicas);
        var nomes = java.util.Arrays.stream(PoliticaRateLimit.values()).map(PoliticaRateLimit::nome).toList();
        for (String nome : politicas.keySet()) {
            if (!nomes.contains(nome)) {
                // Erro de digitação numa variável de ambiente não pode passar em silêncio.
                throw new IllegalArgumentException("Política de rate limit desconhecida: " + nome);
            }
        }
    }

    /**
     * Só padrões. É um método, e não um construtor sem argumentos, de propósito: com dois
     * construtores o Spring deixa de vincular pelo construtor do record e ignora o YAML.
     */
    public static RateLimitProperties padrao() {
        return new RateLimitProperties(null, null, null, null, null, null);
    }

    /** Ajuste de uma política; campos nulos mantêm o padrão. */
    public record Politica(Long capacidade, Duration periodo, ModoRateLimit modo, FalhaArmazem falhaArmazem) {
        public Politica {
            if (capacidade != null && capacidade < 1) {
                throw new IllegalArgumentException("capacidade do rate limit deve ser positiva");
            }
            if (periodo != null && (periodo.isZero() || periodo.isNegative())) {
                throw new IllegalArgumentException("periodo do rate limit deve ser positivo");
            }
        }
    }

    private static Duration positivo(Duration valor, Duration padrao, String nome) {
        if (valor == null) {
            return padrao;
        }
        if (valor.isZero() || valor.isNegative()) {
            throw new IllegalArgumentException("ces.rate-limit." + nome + " deve ser positivo");
        }
        return valor;
    }
}
