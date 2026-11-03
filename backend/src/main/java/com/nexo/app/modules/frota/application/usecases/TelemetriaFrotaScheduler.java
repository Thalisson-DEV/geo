package com.nexo.app.modules.frota.application.usecases;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Rotinas da telemetria: veículos (posição, odômetro e km) a cada 2 minutos, para o mapa da frota, eventos de
 * condução a cada 30 e a limpeza das posições antigas uma vez por dia. Provedor sem chave não é
 * chamado.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelemetriaFrotaScheduler {

    private final SincronizacaoTelemetriaUseCases sincronizacao;

    @Scheduled(cron = "${ces.frota.telemetria.veiculos-cron:0 */2 * * * *}", zone = "America/Sao_Paulo")
    public void veiculos() {
        sincronizacao.sincronizarVeiculos();
    }

    @Scheduled(cron = "${ces.frota.telemetria.eventos-cron:0 5,35 * * * *}", zone = "America/Sao_Paulo")
    public void eventos() {
        sincronizacao.sincronizarEventos();
    }

    @Scheduled(cron = "${ces.frota.telemetria.limpeza-cron:0 15 3 * * *}", zone = "America/Sao_Paulo")
    public void limpar() {
        int apagadas = sincronizacao.limparPosicoes();
        if (apagadas > 0) {
            log.info("Frota: {} posição(ões) de telemetria fora da retenção apagada(s)", apagadas);
        }
    }
}
