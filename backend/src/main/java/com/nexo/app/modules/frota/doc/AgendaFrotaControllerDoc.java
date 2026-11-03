package com.nexo.app.modules.frota.doc;

import com.nexo.app.modules.frota.application.dto.AgendaFrotaResponse;
import com.nexo.app.modules.frota.domain.TipoEventoAgendaFrota;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Frota — Agenda", description = "Calendário de serviços e vencimentos da frota")
public interface AgendaFrotaControllerDoc {

    @Operation(summary = "Eventos do calendário",
            description = "OS agendadas, previsões de término, preventivas e vencimentos de documentos, CNH e apólices no período (até 62 dias). "
                    + "Cada tipo só aparece para quem tem a leitura correspondente.")
    ResponseEntity<AgendaFrotaResponse> agenda(LocalDate de, LocalDate ate, List<UUID> idsBase, List<TipoEventoAgendaFrota> tipos);
}
