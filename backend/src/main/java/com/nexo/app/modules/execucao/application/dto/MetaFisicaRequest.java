package com.nexo.app.modules.execucao.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

@Schema(description = "Meta física da Concessionária de uma base num mês")
public record MetaFisicaRequest(

        @Schema(description = "Base operacional (não muda na edição)")
        UUID idBaseOperacional,

        @Schema(description = "Mês da meta (não muda na edição)", example = "2026-11", type = "string")
        YearMonth competencia,

        @Schema(description = "Total de notas do mês enviado pela Concessionária. Quando informado, a meta de cada serviço "
                + "é calculada na proporção do parcial", example = "626")
        Integer totalMesConcessionária,

        @Schema(description = "Data até a qual a Concessionária calculou o parcial por serviço", example = "2026-11-13")
        LocalDate parcialAte,

        @Size(max = 200)
        String descricao,

        @NotEmpty(message = "Informe ao menos um tipo de serviço.")
        @Valid
        List<Servico> servicos
) {

    @Schema(description = "Serviço da meta")
    public record Servico(
            @NotNull(message = "Escolha o tipo de serviço.")
            UUID idTipoServico,

            @Schema(description = "Notas do mês (sem total da Concessionária)", example = "528")
            Integer quantidade,

            @Schema(description = "Parcial da Concessionária até a data (com total da Concessionária)", example = "215")
            Integer parcialConcessionária
    ) {
    }
}
