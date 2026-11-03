package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.VeiculoSemChecklistResponse;
import com.nexo.app.shared.domain.events.FrotaChecklistAusenteEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Aviso diário, por base, dos veículos usados sem checklist do dia. A falta só avisa: não bloqueia nada. */
@Slf4j
@Service
@RequiredArgsConstructor
public class AvisoChecklistAusenteUseCases {

    /** Referência dos veículos sem base, para a regra ter um id estável. */
    static final UUID SEM_BASE = UUID.fromString("00000000-0000-0000-0000-00000000c4ec");
    static final String LINK = "/frota/checklists?aba=sem-checklist";

    private final ChecklistConsultaUseCases consultas;
    private final ApplicationEventPublisher eventPublisher;

    /** @return quantas bases foram avisadas */
    @Transactional
    public int avisar(LocalDate dia) {
        Map<UUID, List<VeiculoSemChecklistResponse>> porBase = consultas.semChecklist(dia, null).stream()
                .collect(Collectors.groupingBy(v -> v.idBaseOperacional() == null ? SEM_BASE : v.idBaseOperacional(),
                        LinkedHashMap::new, Collectors.toList()));
        porBase.forEach((idBase, veiculos) -> {
            var base = veiculos.getFirst().baseNome() == null ? "sem base" : veiculos.getFirst().baseNome();
            var placas = veiculos.stream().map(VeiculoSemChecklistResponse::placa).collect(Collectors.joining(", "));
            eventPublisher.publishEvent(new FrotaChecklistAusenteEvent(idBase, veiculos.size(), base, placas, LINK));
        });
        log.info("Aviso de checklist ausente em {}: {} base(s).", dia, porBase.size());
        return porBase.size();
    }
}
