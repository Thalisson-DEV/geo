package com.nexo.app.modules.frota.infrastructure.web;

import com.nexo.app.modules.frota.application.dto.AgendaFrotaResponse;
import com.nexo.app.modules.frota.application.usecases.AgendaFrotaUseCases;
import com.nexo.app.modules.frota.doc.AgendaFrotaControllerDoc;
import com.nexo.app.modules.frota.domain.TipoEventoAgendaFrota;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/frota/agenda")
@RequiredArgsConstructor
@PreAuthorize("hasAnyAuthority('frota:os:read', 'frota:documento:read', 'frota:condutor:read', 'frota:preventiva:read', 'frota:seguro:read')")
public class AgendaFrotaController implements AgendaFrotaControllerDoc {

    private final AgendaFrotaUseCases useCases;

    @Override
    @GetMapping
    public ResponseEntity<AgendaFrotaResponse> agenda(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate de,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate ate,
            @RequestParam(required = false) List<UUID> idsBase,
            @RequestParam(required = false) List<TipoEventoAgendaFrota> tipos) {
        return ResponseEntity.ok(useCases.agenda(de, ate, idsBase, tipos));
    }
}
