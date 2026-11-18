package com.nexo.app.modules.execucao.application.dto;

import io.swagger.v3.oas.annotations.Parameter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.YearMonth;
import java.util.UUID;

/** Filtro da listagem de metas físicas. */
public record MetaFisicaFilter(
        UUID idBaseOperacional,

        @Parameter(description = "Mês da meta (yyyy-MM)")
        @DateTimeFormat(pattern = "yyyy-MM")
        YearMonth competencia,

        @Parameter(description = "Ano das metas")
        Integer ano,

        UUID idTipoServico,

        Boolean ativo,

        @Parameter(description = "Busca rápida pela descrição ou pelo nome da base")
        String buscaGlobal
) {
}
