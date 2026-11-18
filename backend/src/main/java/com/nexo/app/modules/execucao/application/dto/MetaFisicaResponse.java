package com.nexo.app.modules.execucao.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

@Schema(description = "Meta física da Concessionária de uma base num mês, distribuída pelos dias úteis")
public record MetaFisicaResponse(
        UUID id,
        UUID idBaseOperacional,
        String baseOperacional,
        @Schema(type = "string", example = "2026-11")
        YearMonth competencia,
        @Schema(description = "Soma das notas de todos os serviços")
        int total,
        Integer totalMesConcessionária,
        LocalDate parcialAte,
        String descricao,
        @Schema(description = "Dias úteis do mês (segunda a sexta, sem feriados nacionais)")
        int diasUteis,
        @Schema(description = "Total dividido pelos dias úteis")
        BigDecimal porDiaUtil,
        List<Servico> servicos,
        boolean ativo,
        OffsetDateTime dataCriacao,
        String usuarioCriacao,
        OffsetDateTime dataUltimaAlteracao,
        String usuarioUltimaAlteracao
) {

    public record Servico(
            UUID idTipoServico,
            String codigoTipoServico,
            String tipoServico,
            int quantidade,
            Integer parcialConcessionária,
            BigDecimal porDiaUtil
    ) {
    }
}
