package com.nexo.app.shared.infrastructure.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.EstimationProbe;
import io.github.bucket4j.local.LocalBucketBuilder;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Baldes na memória da instância, usados só enquanto o Redis está indisponível e para as
 * políticas que pedem {@link FalhaArmazem#LOCAL}. Com mais de uma instância o limite efetivo
 * fica multiplicado pelo número delas, o que é aceitável para um modo de contingência.
 *
 * <p>O número de chaves é limitado: ao passar do teto, saem primeiro os baldes parados há mais
 * tempo que o próprio período (que já estariam cheios de novo); se ainda assim não couber,
 * o mapa é esvaziado, o que só devolve fichas, nunca bloqueia alguém a mais.</p>
 */
class ArmazemBucketsLocal implements ArmazemBuckets {

    private final Map<String, Entrada> baldes = new ConcurrentHashMap<>();
    private final int maxChaves;
    private final LongSupplier relogioNanos;

    ArmazemBucketsLocal(int maxChaves) {
        this(maxChaves, System::nanoTime);
    }

    ArmazemBucketsLocal(int maxChaves, LongSupplier relogioNanos) {
        this.maxChaves = maxChaves;
        this.relogioNanos = relogioNanos;
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

    int tamanho() {
        return baldes.size();
    }

    private Bucket balde(String chave, LimiteRateLimit limite) {
        long agora = relogioNanos.getAsLong();
        if (baldes.size() >= maxChaves && !baldes.containsKey(chave)) {
            liberarEspaco(agora);
        }
        Entrada entrada = baldes.computeIfAbsent(chave, k -> new Entrada(novoBalde(limite), limite.periodo().toNanos()));
        entrada.ultimoUso = agora;
        return entrada.balde;
    }

    private void liberarEspaco(long agora) {
        baldes.entrySet().removeIf(e -> agora - e.getValue().ultimoUso > e.getValue().periodoNanos);
        if (baldes.size() >= maxChaves) {
            baldes.clear();
        }
    }

    private static Bucket novoBalde(LimiteRateLimit limite) {
        LocalBucketBuilder builder = Bucket.builder();
        for (Bandwidth banda : limite.configuracao().getBandwidths()) {
            builder.addLimit(banda);
        }
        return builder.build();
    }

    private static final class Entrada {
        private final Bucket balde;
        private final long periodoNanos;
        private volatile long ultimoUso;

        private Entrada(Bucket balde, long periodoNanos) {
            this.balde = balde;
            this.periodoNanos = periodoNanos;
        }
    }
}
