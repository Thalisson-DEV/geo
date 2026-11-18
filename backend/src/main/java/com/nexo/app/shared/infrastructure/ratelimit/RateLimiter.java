package com.nexo.app.shared.infrastructure.ratelimit;

import com.nexo.app.shared.infrastructure.lookup.LookupRateLimitProperties;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Ponto único de verificação de limites. Quem chama informa a política e a chave (IP,
 * usuário ou login); o serviço aplica o modo da política e a contingência sem Redis.
 *
 * <p>A chave nunca vai em claro para o Redis nem para a memória: vira um SHA-256. O login,
 * que é dado cifrado no banco, também nunca aparece em log.</p>
 */
@Component
@Slf4j
public class RateLimiter {

    private static final long LOG_A_CADA_NANOS = 60_000_000_000L;
    private static final int MAX_CHAVES_LOG = 10_000;

    private final boolean habilitado;
    private final Map<PoliticaRateLimit, LimiteRateLimit> limites;
    private final ArmazemBuckets distribuido;
    private final ArmazemBucketsLocal local;
    private final RateLimitMetricas metricas;
    private final long pausaAposFalhaNanos;
    private final LongSupplier relogioNanos;
    private final Map<String, Long> ultimoLog = new ConcurrentHashMap<>();
    private volatile long distribuidoSuspensoAte;

    @Autowired
    public RateLimiter(RateLimitProperties propriedades,
                       LookupRateLimitProperties lookup,
                       RedisConnectionFactory redis,
                       MeterRegistry registry) {
        this(propriedades, lookup, new ArmazemBucketsRedis(redis, propriedades.timeoutArmazem()),
                new ArmazemBucketsLocal(propriedades.maxChavesLocais()), new RateLimitMetricas(registry),
                System::nanoTime);
    }

    RateLimiter(RateLimitProperties propriedades, LookupRateLimitProperties lookup, ArmazemBuckets distribuido,
                ArmazemBucketsLocal local, RateLimitMetricas metricas, LongSupplier relogioNanos) {
        Objects.requireNonNull(propriedades, "propriedades é obrigatório");
        this.habilitado = propriedades.habilitado();
        this.limites = resolverLimites(propriedades, lookup == null ? new LookupRateLimitProperties() : lookup);
        this.distribuido = Objects.requireNonNull(distribuido, "distribuido é obrigatório");
        this.local = Objects.requireNonNull(local, "local é obrigatório");
        this.metricas = Objects.requireNonNull(metricas, "metricas é obrigatório");
        this.pausaAposFalhaNanos = propriedades.pausaAposFalha().toNanos();
        this.relogioNanos = Objects.requireNonNull(relogioNanos, "relogioNanos é obrigatório");
        // nanoTime pode ser negativo: o marco inicial é "agora", nunca zero.
        this.distribuidoSuspensoAte = relogioNanos.getAsLong();
        limites.values().forEach(l -> log.info("Rate limit {}: {} por {} (modo {}, sem Redis {})",
                l.politica().nome(), l.capacidade(), l.periodo(), l.modo(), l.falhaArmazem()));
    }

    /** Consome uma ficha da política para esta chave. */
    public DecisaoRateLimit consumir(PoliticaRateLimit politica, String chave) {
        return avaliar(politica, chave, true);
    }

    /** Diz se a chave ainda tem ficha, sem consumir (ex.: antes de conferir a senha). */
    public DecisaoRateLimit consultar(PoliticaRateLimit politica, String chave) {
        return avaliar(politica, chave, false);
    }

    ModoRateLimit modo(PoliticaRateLimit politica) {
        return habilitado ? limites.get(politica).modo() : ModoRateLimit.DESLIGADO;
    }

    LimiteRateLimit limite(PoliticaRateLimit politica) {
        return limites.get(politica);
    }

    private DecisaoRateLimit avaliar(PoliticaRateLimit politica, String chave, boolean consumir) {
        Objects.requireNonNull(politica, "politica é obrigatória");
        LimiteRateLimit limite = limites.get(politica);
        if (!habilitado || limite.modo() == ModoRateLimit.DESLIGADO || chave == null || chave.isBlank()) {
            return DecisaoRateLimit.liberada(politica);
        }

        String id = politica.nome() + ":" + resumo(chave);
        ArmazemBuckets.Consumo consumo = executar(limite, id, consumir);
        if (consumo == null || consumo.permitido()) {
            return DecisaoRateLimit.liberada(politica);
        }

        metricas.excedido(politica, limite.modo());
        if (limite.modo() == ModoRateLimit.SOMBRA) {
            DecisaoRateLimit decisao = DecisaoRateLimit.excedida(limite, DecisaoRateLimit.Resultado.SOMBRA,
                    consumo.nanosParaEsperar());
            registrar(id, decisao, chave, "seria barrada (modo sombra)");
            return decisao;
        }
        DecisaoRateLimit decisao = DecisaoRateLimit.excedida(limite, DecisaoRateLimit.Resultado.BLOQUEADA,
                consumo.nanosParaEsperar());
        registrar(id, decisao, chave, "barrada");
        return decisao;
    }

    /** Devolve {@code null} quando a requisição passa por falta do Redis (contingência LIBERAR). */
    private ArmazemBuckets.Consumo executar(LimiteRateLimit limite, String id, boolean consumir) {
        if (relogioNanos.getAsLong() - distribuidoSuspensoAte >= 0) {
            try {
                return consumir ? distribuido.consumir(id, limite) : distribuido.estimar(id, limite);
            } catch (RuntimeException falha) {
                // O limite protege o tráfego e não pode derrubar o login nem as telas: sem Redis,
                // segue a regra da política e só tenta o Redis de novo depois da pausa.
                distribuidoSuspensoAte = relogioNanos.getAsLong() + pausaAposFalhaNanos;
                if (distribuido instanceof ArmazemBucketsRedis redis) {
                    redis.reiniciar();
                }
                log.warn("Rate limit sem Redis por {} s; política {} segue em {} (falha={})",
                        pausaAposFalhaNanos / 1_000_000_000L, limite.politica().nome(), limite.falhaArmazem(),
                        falha.getClass().getSimpleName());
            }
        }
        metricas.falhaArmazem(limite.politica(), limite.falhaArmazem());
        if (limite.falhaArmazem() == FalhaArmazem.LOCAL) {
            return consumir ? local.consumir(id, limite) : local.estimar(id, limite);
        }
        return null;
    }

    /** Uma linha por chave e minuto, para o log não virar outro vetor de abuso. */
    private void registrar(String id, DecisaoRateLimit decisao, String chave, String desfecho) {
        long agora = relogioNanos.getAsLong();
        Long anterior = ultimoLog.get(id);
        if (anterior != null && agora - anterior < LOG_A_CADA_NANOS) {
            return;
        }
        if (ultimoLog.size() >= MAX_CHAVES_LOG) {
            ultimoLog.clear();
        }
        ultimoLog.put(id, agora);
        log.warn("Rate limit {}: requisição {}; chave={} limite={}/{} retryAfter={}s",
                decisao.politica().nome(), desfecho, paraLog(decisao.politica(), chave, id),
                decisao.capacidade(), decisao.periodo(), decisao.retryAfterSegundos());
    }

    /** IP e id de usuário ajudam a calibrar; login fica só como resumo. */
    private static String paraLog(PoliticaRateLimit politica, String chave, String id) {
        return switch (politica.tipoChave()) {
            case IP, USUARIO -> chave;
            case CONTA -> "resumo:" + id.substring(id.indexOf(':') + 1, id.indexOf(':') + 13);
        };
    }

    static String resumo(String chave) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(("geo-rate-limit|" + chave.strip()).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash, 0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponível na JVM", e);
        }
    }

    private static Map<PoliticaRateLimit, LimiteRateLimit> resolverLimites(RateLimitProperties propriedades,
                                                                         LookupRateLimitProperties lookup) {
        Map<PoliticaRateLimit, LimiteRateLimit> resolvidos = new EnumMap<>(PoliticaRateLimit.class);
        for (PoliticaRateLimit politica : PoliticaRateLimit.values()) {
            RateLimitProperties.Politica ajuste = propriedades.politicas().get(politica.nome());
            long capacidade = politica.capacidadePadrao();
            var periodo = politica.periodoPadrao();
            ModoRateLimit modo = propriedades.modoPadrao();
            if (politica == PoliticaRateLimit.LOOKUP) {
                // Compatível com geo.lookup.rate-limit, que já barrava antes desta configuração.
                capacidade = lookup.requestsPerMinute();
                periodo = lookup.window();
                modo = lookup.enabled() ? ModoRateLimit.ATIVO : ModoRateLimit.DESLIGADO;
            }
            FalhaArmazem falha = politica.falhaPadrao();
            if (ajuste != null) {
                if (ajuste.capacidade() != null) capacidade = ajuste.capacidade();
                if (ajuste.periodo() != null) periodo = ajuste.periodo();
                if (ajuste.modo() != null) modo = ajuste.modo();
                if (ajuste.falhaArmazem() != null) falha = ajuste.falhaArmazem();
            }
            resolvidos.put(politica, LimiteRateLimit.de(politica, modo, capacidade, periodo, falha));
        }
        return Map.copyOf(resolvidos);
    }
}
