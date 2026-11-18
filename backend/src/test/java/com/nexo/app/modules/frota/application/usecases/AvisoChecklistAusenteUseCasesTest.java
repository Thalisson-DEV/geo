package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.VeiculoSemChecklistResponse;
import com.nexo.app.shared.domain.events.FrotaChecklistAusenteEvent;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

@ExtendWith(MockitoExtension.class)
class AvisoChecklistAusenteUseCasesTest {

    private static final LocalDate HOJE = LocalDate.of(2026, 10, 15);

    @Mock
    private ChecklistConsultaUseCases consultas;
    @Mock
    private ApplicationEventPublisher eventPublisher;
    @InjectMocks
    private AvisoChecklistAusenteUseCases useCases;

    private static VeiculoSemChecklistResponse veiculo(String placa, UUID idBase, String base) {
        return new VeiculoSemChecklistResponse(UUID.randomUUID(), placa, idBase, base, "Usado hoje sem checklist", null, null);
    }

    @Test
    void avisaUmaVezPorBaseComAsPlacas() {
        UUID juazeiro = UUID.randomUUID();
        when(consultas.semChecklist(HOJE, null)).thenReturn(List.of(
                veiculo("ABC1D23", juazeiro, "JUAZEIRO"),
                veiculo("DEF4G56", juazeiro, "JUAZEIRO"),
                veiculo("GHI7J89", null, null)));

        assertThat(useCases.avisar(HOJE)).isEqualTo(2);

        var captor = ArgumentCaptor.forClass(FrotaChecklistAusenteEvent.class);
        verify(eventPublisher, times(2)).publishEvent(captor.capture());
        var juazeiroEvento = captor.getAllValues().getFirst();
        assertThat(juazeiroEvento.idReferencia()).isEqualTo(juazeiro);
        assertThat(juazeiroEvento.contexto())
                .containsEntry("quantidade", 2)
                .containsEntry("base", "JUAZEIRO")
                .containsEntry("placas", "ABC1D23, DEF4G56")
                .containsEntry("link", "/frota/checklists?aba=sem-checklist");
        assertThat(captor.getAllValues().get(1).contexto()).containsEntry("base", "sem base");
    }

    @Test
    void semVeiculoPendenteNaoAvisa() {
        when(consultas.semChecklist(HOJE, null)).thenReturn(List.of());

        assertThat(useCases.avisar(HOJE)).isZero();
        verify(eventPublisher, never()).publishEvent(any(Object.class));
    }
}
