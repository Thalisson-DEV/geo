package com.nexo.app.modules.frota.application.dto;

import java.util.List;

/** Resultado da validação ou da confirmação da planilha de despesas. */
public record ImportacaoDespesasResponse(
        List<DespesaImportacaoLinha> registros,
        int totalProcessados,
        int totalSucesso,
        int totalFalha
) {
}
