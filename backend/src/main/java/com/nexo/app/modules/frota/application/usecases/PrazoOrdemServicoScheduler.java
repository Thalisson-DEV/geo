package com.nexo.app.modules.frota.application.usecases;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;

/** Procura, a cada meia hora, OS em andamento que passaram da previsão de término. */
@Component
@RequiredArgsConstructor
public class PrazoOrdemServicoScheduler {

    private final OrdemServicoUseCases ordens;

    @Scheduled(cron = "${ces.frota.os-prazo-cron:0 */30 * * * *}", zone = "America/Sao_Paulo")
    public void processar() {
        ordens.avisarPrazosEstourados(OffsetDateTime.now());
    }
}
