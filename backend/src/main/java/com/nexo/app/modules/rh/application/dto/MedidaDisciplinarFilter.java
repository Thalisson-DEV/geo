package com.nexo.app.modules.rh.application.dto;

import com.nexo.app.modules.rh.domain.OrigemMedidaDisciplinar;
import com.nexo.app.modules.rh.domain.SituacaoMedidaDisciplinar;
import io.swagger.v3.oas.annotations.Parameter;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record MedidaDisciplinarFilter(
        @Parameter(description = "Trecho do nome do colaborador") String busca,
        UUID idColaborador,
        List<UUID> idsBase,
        List<UUID> idsTipo,
        List<UUID> idsMotivo,
        List<SituacaoMedidaDisciplinar> situacoes,
        List<OrigemMedidaDisciplinar> origens,
        @Parameter(description = "Fato a partir de") LocalDate de,
        @Parameter(description = "Fato até") LocalDate ate
) {
    public static MedidaDisciplinarFilter vazio() {
        return new MedidaDisciplinarFilter(null, null, null, null, null, null, null, null, null);
    }
}
