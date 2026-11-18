package com.nexo.app.modules.dashboard.application.dto;

import com.nexo.app.shared.application.SelecaoMultipla;
import io.swagger.v3.oas.annotations.Parameter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

/** Recorte do painel da meta física. Sem mês, vale o mês corrente. */
public record DashboardMetaFisicaFilter(
        @Parameter(description = "Mês analisado (yyyy-MM)")
        @DateTimeFormat(pattern = "yyyy-MM")
        YearMonth competencia,

        @Parameter(description = "Bases operacionais (repetir o parâmetro ou separar por vírgula)")
        List<UUID> idBaseOperacional,

        @Parameter(description = "Tipos de serviço (repetir o parâmetro ou separar por vírgula)")
        List<UUID> idTipoServico
) {

    public DashboardMetaFisicaFilter {
        idBaseOperacional = SelecaoMultipla.normalizar(idBaseOperacional);
        idTipoServico = SelecaoMultipla.normalizar(idTipoServico);
    }
}
