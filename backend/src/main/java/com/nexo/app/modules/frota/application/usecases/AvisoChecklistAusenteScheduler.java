package com.nexo.app.modules.frota.application.usecases;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/** Às 10h (Brasília), avisa as bases dos veículos usados sem checklist do dia. */
@Component
@RequiredArgsConstructor
public class AvisoChecklistAusenteScheduler {

    private final AvisoChecklistAusenteUseCases useCases;

    @Scheduled(cron = "${ces.frota.checklist-ausente-cron:0 0 10 * * *}", zone = "America/Sao_Paulo")
    public void processar() {
        useCases.avisar(LocalDate.now(LiberacaoCnhUseCases.FUSO));
    }
}
