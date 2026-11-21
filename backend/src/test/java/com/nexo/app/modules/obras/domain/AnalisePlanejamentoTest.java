package com.nexo.app.modules.obras.domain;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AnalisePlanejamentoTest {

    private static AnalisePlanejamento criadaHa(Duration tempo) {
        AnalisePlanejamento analise = new AnalisePlanejamento(UUID.randomUUID(), UUID.randomUUID(), 1, "modelo");
        ReflectionTestUtils.setField(analise, "dataCriacao", OffsetDateTime.now().minus(tempo));
        return analise;
    }

    @Test
    void leituraInterrompidaPeloReinicioFalhaDepoisDoPrazo() {
        AnalisePlanejamento analise = criadaHa(Duration.ofMinutes(40));

        assertThat(analise.expirarSeTravada(OffsetDateTime.now(), Duration.ofMinutes(30))).isTrue();
        assertThat(analise.getStatus()).isEqualTo(StatusAnalisePlanejamento.FALHOU);
        assertThat(analise.getMensagem()).contains("Peça a leitura de novo");
    }

    @Test
    void leituraDentroDoPrazoOuJaConcluidaNaoMuda() {
        AnalisePlanejamento recente = criadaHa(Duration.ofMinutes(5));
        assertThat(recente.expirarSeTravada(OffsetDateTime.now(), Duration.ofMinutes(30))).isFalse();
        assertThat(recente.getStatus()).isEqualTo(StatusAnalisePlanejamento.PROCESSANDO);

        AnalisePlanejamento concluida = criadaHa(Duration.ofHours(2));
        concluida.concluir(null);
        assertThat(concluida.expirarSeTravada(OffsetDateTime.now(), Duration.ofMinutes(30))).isFalse();
        assertThat(concluida.getStatus()).isEqualTo(StatusAnalisePlanejamento.CONCLUIDA);
    }
}
