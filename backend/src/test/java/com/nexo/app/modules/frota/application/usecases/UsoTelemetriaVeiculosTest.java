package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.domain.Expediente;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository.Dia;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository.Turno;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class UsoTelemetriaVeiculosTest {

    private static final Expediente EXPEDIENTE = new Expediente(LocalTime.of(6, 0), LocalTime.of(19, 0), false);
    private final UUID id = UUID.randomUUID();

    private Dia dia(LocalDate d, double km, int foraMin) {
        return new Dia(id, d, UUID.randomUUID(), km, 120, 30, foraMin > 0 ? 5 : 0, foraMin, null, null, 50);
    }

    @Test
    void rodaPoucoSoComCincoDiasUteisMedidosEContandoDesdeQueORastreadorMede() {
        // 19 a 30/10/2026: 10 dias úteis; o rastreador só começou a medir na quinta, 29/10 (2 dias úteis).
        var de = LocalDate.of(2026, 10, 19);
        var ate = LocalDate.of(2026, 10, 30);
        var recemVinculado = UsoTelemetriaVeiculos.uso(id, List.of(dia(LocalDate.of(2026, 10, 29), 10, 0)),
                LocalDate.of(2026, 10, 29), de, ate, EXPEDIENTE);

        assertThat(recemVinculado.diasUteisMedidos()).isLessThanOrEqualTo(2);
        assertThat(recemVinculado.rodaPouco()).as("pouco dado ainda").isFalse();

        var medidoOPeriodoTodo = UsoTelemetriaVeiculos.uso(id, List.of(dia(LocalDate.of(2026, 10, 20), 30, 0),
                dia(LocalDate.of(2026, 10, 21), 20, 40)), LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 21), LocalDate.of(2026, 10, 2),
                EXPEDIENTE);
        assertThat(medidoOPeriodoTodo.rodaPouco()).isTrue();
        assertThat(medidoOPeriodoTodo.diasForaExpediente()).isEqualTo(1);
        assertThat(medidoOPeriodoTodo.usadoForaDoExpediente()).isTrue();
        assertThat(medidoOPeriodoTodo.litrosOciosos()).as("60 min a 1 L/h").isEqualTo(1.0);
    }

    @Test
    void resumoDoTurnoDaProducaoPorKmEOTempoAteSairDaBase() {
        var inicio = OffsetDateTime.parse("2026-10-26T07:00:00-03:00");
        var turno = new Turno(UUID.randomUUID(), id, UUID.randomUUID(), null, inicio, inicio.plusHours(9), true, 80.0, 120,
                240, 30, 45, 10, inicio.plusMinutes(35), inicio.plusHours(8), 6, new BigDecimal("2000.00"), 5, 1, 0);

        var resumo = TelemetriaTurnoUseCases.resumo(turno);

        assertThat(resumo.minutosAteSairDaBase()).isEqualTo(35);
        assertThat(resumo.producaoPorKm()).isEqualByComparingTo("25.00");
        assertThat(resumo.notasForaDoLocal()).isEqualTo(1);
        assertThat(resumo.minutosParadoSemServico()).isEqualTo(45);
    }
}
