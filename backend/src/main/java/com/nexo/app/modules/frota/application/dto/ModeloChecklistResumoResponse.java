package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoModeloChecklist;

import java.util.List;
import java.util.UUID;

/** Linha da lista de modelos. Tipos vazios no principal = vale para todos os veículos. */
public record ModeloChecklistResumoResponse(
        UUID id,
        String nome,
        TipoModeloChecklist tipo,
        String tipoRotulo,
        List<String> tiposVeiculo,
        List<String> tiposImplemento,
        int quantidadePerguntas,
        int quantidadeFotosRecebimento,
        boolean ativo
) {
}
