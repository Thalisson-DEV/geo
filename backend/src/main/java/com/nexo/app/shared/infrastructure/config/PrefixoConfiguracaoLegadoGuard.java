package com.nexo.app.shared.infrastructure.config;

import java.util.List;
import java.util.Locale;
import java.util.TreeMap;
import java.util.stream.Stream;

import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.EnumerablePropertySource;

/**
 * Recusa subir a aplicação quando ainda encontra configuração com o prefixo antigo do produto
 * (propriedades {@code ces.*} ou variáveis de ambiente {@code CES_*}). Depois da troca para
 * {@code geo.*}/{@code GEO_*} essas chaves seriam ignoradas em silêncio, então é melhor parar com uma
 * mensagem que diz exatamente qual chave usar.
 */
public class PrefixoConfiguracaoLegadoGuard implements EnvironmentPostProcessor, Ordered {

    // renomear-geo: manter a linha seguinte (prefixo antigo procurado de propósito)
    static final String PREFIXO_PROPRIEDADE_LEGADO = "ces.";
    // renomear-geo: manter a linha seguinte
    static final String PREFIXO_VARIAVEL_LEGADO = "CES_";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        List<String> encontradas = chavesLegadas(environment);
        if (!encontradas.isEmpty()) {
            throw new IllegalStateException(mensagem(encontradas));
        }
    }

    /** Depois do carregamento dos arquivos de configuração, para enxergar todas as fontes. */
    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }

    static List<String> chavesLegadas(ConfigurableEnvironment environment) {
        return environment.getPropertySources().stream()
                .filter(EnumerablePropertySource.class::isInstance)
                .map(EnumerablePropertySource.class::cast)
                .flatMap(fonte -> Stream.of(fonte.getPropertyNames()))
                .filter(PrefixoConfiguracaoLegadoGuard::legada)
                .distinct()
                .sorted()
                .toList();
    }

    static boolean legada(String chave) {
        return chave.toLowerCase(Locale.ROOT).startsWith(PREFIXO_PROPRIEDADE_LEGADO)
                || chave.startsWith(PREFIXO_VARIAVEL_LEGADO);
    }

    static String substituta(String chave) {
        if (chave.startsWith(PREFIXO_VARIAVEL_LEGADO)) {
            return "GEO_" + chave.substring(PREFIXO_VARIAVEL_LEGADO.length());
        }
        return "geo." + chave.substring(PREFIXO_PROPRIEDADE_LEGADO.length());
    }

    static String mensagem(List<String> encontradas) {
        TreeMap<String, String> trocas = new TreeMap<>();
        encontradas.forEach(chave -> trocas.put(chave, substituta(chave)));
        StringBuilder texto = new StringBuilder(
                "A configuração usa o prefixo antigo do produto e seria ignorada. Renomeie antes de subir:");
        trocas.forEach((antiga, nova) -> texto.append(System.lineSeparator()).append("  ")
                .append(antiga).append(" -> ").append(nova));
        return texto.toString();
    }
}
