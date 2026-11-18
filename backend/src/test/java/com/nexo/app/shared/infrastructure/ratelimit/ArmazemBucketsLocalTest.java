package com.nexo.app.shared.infrastructure.ratelimit;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class ArmazemBucketsLocalTest {

    private final LimiteRateLimit umPorMinuto = LimiteRateLimit.de(PoliticaRateLimit.LOGIN_IP, ModoRateLimit.ATIVO,
            1, Duration.ofMinutes(1), FalhaArmazem.LOCAL);

    @Test
    void consomeEEstimaComoUmTokenBucket() {
        ArmazemBucketsLocal armazem = new ArmazemBucketsLocal(100);

        assertThat(armazem.estimar("a", umPorMinuto).permitido()).isTrue();
        assertThat(armazem.consumir("a", umPorMinuto).permitido()).isTrue();
        ArmazemBuckets.Consumo recusado = armazem.consumir("a", umPorMinuto);
        assertThat(recusado.permitido()).isFalse();
        assertThat(recusado.nanosParaEsperar()).isPositive();
    }

    @Test
    void naoPassaDoTetoDeChavesDescartandoPrimeiroAsParadas() {
        AtomicLong relogio = new AtomicLong();
        ArmazemBucketsLocal armazem = new ArmazemBucketsLocal(100, relogio::get);
        for (int i = 0; i < 100; i++) {
            armazem.consumir("antiga-" + i, umPorMinuto);
        }
        relogio.addAndGet(Duration.ofMinutes(2).toNanos());

        armazem.consumir("nova", umPorMinuto);

        assertThat(armazem.tamanho()).isEqualTo(1);
    }

    @Test
    void comTodasAsChavesRecentesEsvaziaEmVezDeCrescerSemLimite() {
        ArmazemBucketsLocal armazem = new ArmazemBucketsLocal(100, () -> 0L);
        for (int i = 0; i < 150; i++) {
            armazem.consumir("chave-" + i, umPorMinuto);
        }

        assertThat(armazem.tamanho()).isLessThanOrEqualTo(100);
    }
}
