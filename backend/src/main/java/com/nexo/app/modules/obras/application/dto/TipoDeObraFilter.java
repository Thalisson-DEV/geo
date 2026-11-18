package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.ControleExecucaoObra;

public record TipoDeObraFilter(
        String buscaGlobal,
        ControleExecucaoObra controleExecucao,
        Boolean subtipo,
        Boolean ativo
) {
}
