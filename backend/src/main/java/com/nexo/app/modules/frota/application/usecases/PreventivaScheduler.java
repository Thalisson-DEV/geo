package com.nexo.app.modules.frota.application.usecases;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Rotina diária da preventiva: sincroniza os controles, abre as OS dos planos com abertura
 * automática (uma transação por veículo, para um veículo com problema não travar os outros)
 * e avisa as etapas próximas e vencidas.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PreventivaScheduler {

    private final PreventivaUseCases useCases;

    @Scheduled(cron = "${ces.frota.preventiva-cron:0 40 4 * * *}", zone = "America/Sao_Paulo")
    public void processar() {
        processar(LocalDate.now(LiberacaoCnhUseCases.FUSO));
    }

    void processar(LocalDate hoje) {
        int sincronizados = useCases.sincronizarFrota();
        int abertas = 0;
        for (List<UUID> grupo : useCases.pendentesDeAberturaAutomatica(hoje)) {
            try {
                abertas += useCases.abrirAutomaticamente(grupo).ordens().size();
            } catch (RuntimeException e) {
                log.warn("Frota: não foi possível abrir a OS preventiva automática dos controles {}: {}", grupo, e.getMessage());
            }
        }
        int avisos = useCases.avisar(hoje);
        if (sincronizados + abertas + avisos > 0) {
            log.info("Frota: preventiva com {} controle(s) sincronizado(s), {} OS automática(s) e {} aviso(s)",
                    sincronizados, abertas, avisos);
        }
    }
}
