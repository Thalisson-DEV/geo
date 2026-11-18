package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.execucao.TurnoVeiculoApi;
import com.nexo.app.modules.execucao.TurnoVeiculoApi.TurnoDoVeiculo;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository.Turno;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TelemetriaTurnoUseCasesTest {

    @Mock
    private AnaliseTelemetriaRepository analises;
    @Mock
    private CalculoAnalisesFrota calculo;
    @Mock
    private ReferenciasFrota referencias;
    @Mock
    private TurnoVeiculoApi turnoApi;
    @Mock
    private TelemetriaFrotaUseCases telemetria;
    @InjectMocks
    private TelemetriaTurnoUseCases useCases;

    private final OffsetDateTime agora = OffsetDateTime.now();

    private Turno gravado(UUID id, boolean comTelemetria) {
        return new Turno(id, UUID.randomUUID(), UUID.randomUUID(), null, agora.minusHours(10), agora.minusHours(2), comTelemetria,
                comTelemetria ? 50 : 0, 60, 120, 0, 0, 0, null, null, 2, new BigDecimal("500.00"), 2, 0, 0);
    }

    @Test
    void usaOResumoGravadoENaoRecalculaOQueJaFoiResumidoSemTrajeto() {
        UUID comTrajeto = UUID.randomUUID();
        UUID semTrajeto = UUID.randomUUID();
        when(analises.listarTurnosPorIds(any())).thenReturn(List.of(gravado(comTrajeto, true), gravado(semTrajeto, false)));
        when(analises.primeiraPosicao()).thenReturn(agora.minusDays(1));
        when(turnoApi.buscarVarios(anyList())).thenReturn(List.of());

        Map<UUID, ?> resumo = useCases.resumir(List.of(comTrajeto, semTrajeto));

        assertThat(resumo).containsOnlyKeys(comTrajeto);
        verify(turnoApi).buscarVarios(List.of());
        verify(calculo, never()).calcularTurno(any(), any(), any(), any());
    }

    @Test
    void semResumoCalculaNaHoraSoOTurnoQueTerminouDepoisDaPrimeiraPosicao() {
        UUID recente = UUID.randomUUID();
        UUID antigo = UUID.randomUUID();
        when(analises.listarTurnosPorIds(any())).thenReturn(List.of());
        when(analises.primeiraPosicao()).thenReturn(agora.minusDays(1));
        var turnoRecente = new TurnoDoVeiculo(recente, UUID.randomUUID(), UUID.randomUUID(), agora.minusHours(8), agora.minusHours(3), false);
        var turnoAntigo = new TurnoDoVeiculo(antigo, UUID.randomUUID(), UUID.randomUUID(), agora.minusDays(20), agora.minusDays(20), false);
        when(turnoApi.buscarVarios(anyList())).thenReturn(List.of(turnoRecente, turnoAntigo));
        when(calculo.calcularTurno(any(), any(), any(), any())).thenReturn(new CalculoAnalisesFrota.TurnoCalculado(
                gravado(recente, true), List.of(), List.of(), List.of(), null, 300, Map.of()));

        var resumo = useCases.resumir(List.of(recente, antigo));

        assertThat(resumo).containsOnlyKeys(recente);
        verify(calculo).calcularTurno(org.mockito.ArgumentMatchers.eq(turnoRecente), any(), any(), any());
        verify(calculo, never()).calcularTurno(org.mockito.ArgumentMatchers.eq(turnoAntigo), any(), any(), any());
    }

    @Test
    void oTurnoECalculadoPeloHistoricoDoProvedorEPelasPosicoesGravadasSemEle() {
        UUID id = UUID.randomUUID();
        var turno = new TurnoDoVeiculo(id, UUID.randomUUID(), UUID.randomUUID(), agora.minusHours(8), agora.minusHours(3), false);
        when(turnoApi.buscar(id)).thenReturn(java.util.Optional.of(turno));
        var ponto = new com.nexo.app.modules.frota.domain.AnaliseTrajeto.Ponto(agora.minusHours(7), -12.05, -38.55, 20.0, true, null);
        when(calculo.calcularTurno(any(), any(), any(), any(), any())).thenReturn(new CalculoAnalisesFrota.TurnoCalculado(
                gravado(id, true), List.of(), List.of(ponto, ponto), List.of(), null, 300, Map.of()));
        var leitura = new com.nexo.app.modules.frota.domain.FonteTelemetria.Leitura(agora.minusHours(7), -12.05, -38.55, 20.0, true, null, null, null);
        when(telemetria.historicoDoVeiculo(turno.idVeiculo(), turno.inicio(), turno.fim())).thenReturn(List.of(leitura, leitura, leitura));

        assertThat(useCases.trajeto(id).orElseThrow().trajeto()).hasSize(2);
        verify(calculo).calcularTurno(org.mockito.ArgumentMatchers.eq(turno), any(), any(), any(),
                org.mockito.ArgumentMatchers.argThat(pontos -> pontos != null && pontos.size() == 3 && pontos.getFirst().latitude() == -12.05));

        when(telemetria.historicoDoVeiculo(any(), any(), any())).thenReturn(null);
        useCases.trajeto(id);
        verify(calculo).calcularTurno(org.mockito.ArgumentMatchers.eq(turno), any(), any(), any(), org.mockito.ArgumentMatchers.isNull());
    }
}
