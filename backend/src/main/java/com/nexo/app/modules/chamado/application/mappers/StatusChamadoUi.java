package com.nexo.app.modules.chamado.application.mappers;

import com.nexo.app.modules.chamado.domain.StatusChamado;
import com.nexo.app.shared.application.dto.EnumDeUi;
import com.nexo.app.shared.application.dto.StatusDto;
import com.nexo.app.shared.application.dto.UiSeverity;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

/** Status do chamado para a interface ({@code GET /api/v1/meta/enums/status-chamado}). */
@Component
public class StatusChamadoUi implements EnumDeUi {

    public static StatusDto de(StatusChamado status) {
        return switch (status) {
            case ABERTO -> new StatusDto(status.name(), "Aberto", UiSeverity.INFO);
            case EM_ATENDIMENTO -> new StatusDto(status.name(), "Em atendimento", UiSeverity.WARN);
            case AGUARDANDO_SOLICITANTE -> new StatusDto(status.name(), "Aguardando solicitante", UiSeverity.SECONDARY);
            case RESOLVIDO -> new StatusDto(status.name(), "Resolvido", UiSeverity.SUCCESS);
            case FECHADO -> new StatusDto(status.name(), "Fechado", UiSeverity.SECONDARY);
            case CANCELADO -> new StatusDto(status.name(), "Cancelado", UiSeverity.DANGER);
        };
    }

    @Override
    public String nome() {
        return "status-chamado";
    }

    @Override
    public List<StatusDto> valores() {
        return Arrays.stream(StatusChamado.values()).map(StatusChamadoUi::de).toList();
    }
}
