package com.nexo.app.modules.desconto.application.mappers;

import com.nexo.app.modules.desconto.domain.StatusDesconto;
import com.nexo.app.shared.application.dto.EnumDeUi;
import com.nexo.app.shared.application.dto.StatusDto;
import com.nexo.app.shared.application.dto.UiSeverity;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

/** Status do desconto para a interface ({@code GET /api/v1/meta/enums/status-desconto}). */
@Component
public class StatusDescontoUi implements EnumDeUi {

    public static StatusDto de(StatusDesconto status) {
        return switch (status) {
            case SOLICITADO -> new StatusDto(status.name(), "Solicitado", UiSeverity.WARN);
            case VALIDADO -> new StatusDto(status.name(), "Validado", UiSeverity.INFO);
            case BAIXADO -> new StatusDto(status.name(), "Baixado", UiSeverity.SUCCESS);
            case FINALIZADO -> new StatusDto(status.name(), "Finalizado", UiSeverity.SUCCESS);
            case REJEITADO -> new StatusDto(status.name(), "Rejeitado", UiSeverity.DANGER);
        };
    }

    @Override
    public String nome() {
        return "status-desconto";
    }

    @Override
    public List<StatusDto> valores() {
        return Arrays.stream(StatusDesconto.values()).map(StatusDescontoUi::de).toList();
    }
}
