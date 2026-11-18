package com.nexo.app.shared.infrastructure.ratelimit;

import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.EstimationProbe;
import io.github.bucket4j.distributed.BucketProxy;
import io.github.bucket4j.distributed.ExpirationAfterWriteStrategy;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import io.github.bucket4j.redis.lettuce.Bucket4jLettuce;
import io.lettuce.core.api.async.RedisAsyncCommands;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Objects;

/**
 * Baldes no Redis, compartilhados entre as instâncias do backend, via Bucket4j sobre a mesma
 * conexão Lettuce do Spring Data Redis (mesmo endereço, senha, TLS e banco do cache).
 *
 * <p>A conexão é obtida só no primeiro uso, para a aplicação subir mesmo com o Redis fora.
 * Toda operação tem prazo ({@code timeoutArmazem}); estourado, quem chamou trata como falha
 * e segue pela regra da política. Cada chave expira sozinha assim que o balde estaria cheio
 * de novo, então nada se acumula no Redis.</p>
 */
class ArmazemBucketsRedis implements ArmazemBuckets {

    static final String PREFIXO = "ces:rate-limit:";
    private static final Duration FOLGA_EXPIRACAO = Duration.ofSeconds(10);

    private final RedisConnectionFactory fabrica;
    private final Duration timeout;

    private RedisConnection conexao;
    private volatile ProxyManager<byte[]> proxyManager;

    ArmazemBucketsRedis(RedisConnectionFactory fabrica, Duration timeout) {
        this.fabrica = Objects.requireNonNull(fabrica, "fabrica é obrigatória");
        this.timeout = Objects.requireNonNull(timeout, "timeout é obrigatório");
    }

    @Override
    public Consumo consumir(String chave, LimiteRateLimit limite) {
        ConsumptionProbe probe = balde(chave, limite).tryConsumeAndReturnRemaining(1);
        return Consumo.de(probe.isConsumed(), probe.getNanosToWaitForRefill());
    }

    @Override
    public Consumo estimar(String chave, LimiteRateLimit limite) {
        EstimationProbe probe = balde(chave, limite).estimateAbilityToConsume(1);
        return Consumo.de(probe.canBeConsumed(), probe.getNanosToWaitForRefill());
    }

    /** Descarta a conexão atual; a próxima operação abre outra. */
    synchronized void reiniciar() {
        proxyManager = null;
        if (conexao != null) {
            try {
                conexao.close();
            } catch (RuntimeException ignorada) {
                // A conexão já estava quebrada; não há o que liberar.
            }
            conexao = null;
        }
    }

    private BucketProxy balde(String chave, LimiteRateLimit limite) {
        byte[] chaveRedis = (PREFIXO + chave).getBytes(StandardCharsets.UTF_8);
        return proxyManager().builder().build(chaveRedis, limite::configuracao);
    }

    private ProxyManager<byte[]> proxyManager() {
        ProxyManager<byte[]> atual = proxyManager;
        if (atual != null) {
            return atual;
        }
        synchronized (this) {
            if (proxyManager == null) {
                proxyManager = criar();
            }
            return proxyManager;
        }
    }

    @SuppressWarnings("unchecked")
    private ProxyManager<byte[]> criar() {
        RedisConnection nova = fabrica.getConnection();
        Object nativa = nova.getNativeConnection();
        if (!(nativa instanceof RedisAsyncCommands<?, ?> comandos)) {
            nova.close();
            throw new IllegalStateException("Rate limit exige Redis standalone via Lettuce; recebido "
                    + (nativa == null ? "nulo" : nativa.getClass().getSimpleName()));
        }
        // Mantida aberta: com conexão nativa dedicada, fechar o wrapper fecharia os comandos.
        conexao = nova;
        return Bucket4jLettuce.casBasedBuilder((RedisAsyncCommands<byte[], byte[]>) comandos)
                .expirationAfterWrite(ExpirationAfterWriteStrategy.basedOnTimeForRefillingBucketUpToMax(FOLGA_EXPIRACAO))
                .requestTimeout(timeout)
                .build();
    }
}
