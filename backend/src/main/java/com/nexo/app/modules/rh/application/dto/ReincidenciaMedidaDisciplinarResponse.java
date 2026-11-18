package com.nexo.app.modules.rh.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Schema(description = "Medidas anteriores do mesmo colaborador e motivo, e o tipo sugerido. A sugestão não é imposta.")
public record ReincidenciaMedidaDisciplinarResponse(
        int janelaMeses,
        int diasImediatidade,
        List<Anterior> anteriores,
        @Schema(description = "Gravidade da medida anterior mais recente") Integer gravidadeUltima,
        @Schema(description = "Tipo ativo logo acima da última; nulo sem anteriores ou já no topo") UUID idTipoSugerido,
        String tipoSugeridoNome
) {
    public record Anterior(UUID id, String tipoNome, int gravidade, LocalDate dataFato, LocalDate dataAplicacao,
                           String situacaoRotulo) {
    }
}
