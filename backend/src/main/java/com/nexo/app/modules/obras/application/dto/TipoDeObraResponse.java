package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.ControleExecucaoObra;
import com.nexo.app.modules.obras.domain.TipoObra;

import java.time.OffsetDateTime;
import java.util.UUID;

public record TipoDeObraResponse(
        UUID id,
        String codigo,
        String nome,
        String descricao,
        ControleExecucaoObra controleExecucao,
        boolean subtipo,
        TipoObra classeOperacional,
        boolean ativo,
        OffsetDateTime dataCriacao,
        OffsetDateTime dataUltimaAlteracao
) {
}
