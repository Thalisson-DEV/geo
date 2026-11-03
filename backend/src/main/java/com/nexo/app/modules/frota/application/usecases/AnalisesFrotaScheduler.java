package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.execucao.TurnoVeiculoApi;
import com.nexo.app.modules.execucao.TurnoVeiculoApi.TurnoDoVeiculo;
import com.nexo.app.modules.frota.application.TelemetriaFrotaProperties;
import com.nexo.app.modules.frota.domain.Expediente;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository.AbastecimentoRealizado;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Mantém os resumos das análises em dia, sem ninguém pedir: a cada 30 minutos recalcula hoje e
 * ontem, os turnos fechados nas últimas 36 horas e os abastecimentos dos últimos 3 dias (notas e
 * abastecimentos chegam atrasados da fila do app); de madrugada, e ao subir o servidor, completa o
 * histórico que ainda não tem resumo (dentro da retenção das posições).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AnalisesFrotaScheduler {

    private static final int LOTE_DIAS = 500;
    private static final int LOTE_TURNOS = 300;
    private static final int MAXIMO_LOTES = 40;

    private final CalculoAnalisesFrota calculo;
    private final AnaliseTelemetriaRepository analises;
    private final ParametrosFrotaUseCases parametros;
    private final TurnoVeiculoApi turnoApi;
    private final TelemetriaFrotaProperties properties;
    /** Um cálculo de cada vez: o histórico pode demorar e cruzar com a rotina de 30 minutos. */
    private final AtomicBoolean rodando = new AtomicBoolean();

    @Value("${ces.frota.analises.calcular-ao-subir:true}")
    private boolean calcularAoSubir;

    @Scheduled(cron = "${ces.frota.analises.recentes-cron:0 7,37 * * * *}", zone = "America/Sao_Paulo")
    public void recentes() {
        executar("recentes", this::atualizarRecentes);
    }

    @Scheduled(cron = "${ces.frota.analises.historico-cron:0 40 3 * * *}", zone = "America/Sao_Paulo")
    public void historico() {
        executar("histórico", this::completarHistorico);
    }

    @Async
    @EventListener(ApplicationReadyEvent.class)
    public void aoSubir() {
        if (!calcularAoSubir) return;
        executar("histórico", () -> {
            completarHistorico();
            atualizarRecentes();
        });
    }

    private void executar(String nome, Runnable rotina) {
        if (!rodando.compareAndSet(false, true)) return;
        try {
            rotina.run();
        } catch (RuntimeException e) {
            log.warn("Frota: análises da telemetria ({}) falharam: {}", nome, e.getMessage(), e);
        } finally {
            rodando.set(false);
        }
    }

    void atualizarRecentes() {
        var agora = OffsetDateTime.now();
        var p = parametros.obter();
        Expediente expediente = p.expediente();
        LocalDate hoje = agora.atZoneSameInstant(Expediente.FUSO).toLocalDate();
        OffsetDateTime inicioOntem = hoje.minusDays(1).atStartOfDay(Expediente.FUSO).toOffsetDateTime();
        for (var idVeiculo : analises.veiculosComPosicao(inicioOntem, agora.plusMinutes(1))) {
            calculo.calcularDia(idVeiculo, hoje.minusDays(1), expediente);
            calculo.calcularDia(idVeiculo, hoje, expediente);
        }
        calculo.gravarTurnos(turnoApi.listarFechadosComVeiculo(agora.minusHours(36), agora.plusMinutes(1), 2_000));
        calculo.analisarAbastecimentos(analises.realizados(agora.minusDays(3), agora.plusMinutes(1)));
        calculo.aprenderPostos();
    }

    void completarHistorico() {
        var agora = OffsetDateTime.now();
        var primeira = analises.primeiraPosicao();
        if (primeira == null) return;
        var retencao = agora.minusDays(properties.getRetencaoPosicoesDias());
        var desde = primeira.isAfter(retencao) ? primeira : retencao;
        var expediente = parametros.obter().expediente();
        int dias = 0;
        for (int lote = 0; lote < MAXIMO_LOTES; lote++) {
            var pendentes = analises.diasSemResumo(desde, agora, LOTE_DIAS);
            pendentes.forEach(d -> calculo.calcularDia(d.idVeiculo(), d.dia(), expediente));
            dias += pendentes.size();
            if (pendentes.size() < LOTE_DIAS) break;
        }

        int turnos = 0;
        List<TurnoDoVeiculo> fechados = turnoApi.listarFechadosComVeiculo(desde, agora, 20_000);
        var resumidos = analises.turnosResumidos(fechados.stream().map(TurnoDoVeiculo::idTurno).toList());
        var pendentes = fechados.stream().filter(t -> !resumidos.contains(t.idTurno())).toList();
        for (int i = 0; i < pendentes.size(); i += LOTE_TURNOS) {
            turnos += calculo.gravarTurnos(pendentes.subList(i, Math.min(pendentes.size(), i + LOTE_TURNOS)));
        }

        var realizados = analises.realizados(desde, agora);
        var analisados = analises.abastecimentosAnalisados(realizados.stream().map(AbastecimentoRealizado::id).toList());
        int abastecimentos = calculo.analisarAbastecimentos(realizados.stream().filter(a -> !analisados.contains(a.id())).toList());
        calculo.aprenderPostos();
        if (dias + turnos + abastecimentos > 0) {
            log.info("Frota: análises da telemetria completadas ({} dia(s), {} turno(s), {} abastecimento(s))",
                    dias, turnos, abastecimentos);
        }
    }
}
