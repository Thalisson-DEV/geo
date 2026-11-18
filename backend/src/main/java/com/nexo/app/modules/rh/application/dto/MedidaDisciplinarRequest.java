package com.nexo.app.modules.rh.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

@Schema(description = "Lançamento ou correção de uma medida disciplinar já aplicada ao colaborador")
public record MedidaDisciplinarRequest(
        @NotNull UUID idColaborador,
        @NotNull UUID idTipo,
        @NotNull UUID idMotivo,
        @NotNull LocalDate dataFato,
        @NotNull @Schema(description = "Dia em que a medida foi aplicada ao colaborador") LocalDate dataAplicacao,
        @Size(max = 4000) String descricao,
        @Schema(description = "Obrigatório quando o tipo exige período (suspensão)") Integer diasSuspensao,
        @Schema(description = "Obrigatório quando o tipo exige período (suspensão)") LocalDate inicioSuspensao,
        @Schema(description = "Registro de outro módulo que pediu a medida. Só é lido na criação.")
        @Valid OrigemMedidaDisciplinarRequest origem
) {
}
