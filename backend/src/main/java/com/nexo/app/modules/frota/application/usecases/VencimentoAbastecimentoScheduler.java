package com.nexo.app.modules.frota.application.usecases;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;

/** À meia-noite (Brasília), vence o abastecimento aprovado ou liberado que não foi usado no dia. */
@Slf4j
@Component
@RequiredArgsConstructor
public class VencimentoAbastecimentoScheduler {

    private final AbastecimentoUseCases useCases;

    @Scheduled(cron = "${ces.frota.abastecimento-vencimento-cron:0 0 0 * * *}", zone = "America/Sao_Paulo")
    public void processar() {
        int vencidos = useCases.vencer(OffsetDateTime.now());
        if (vencidos > 0) {
            log.info("Abastecimentos vencidos à meia-noite: {}.", vencidos);
        }
    }
}
