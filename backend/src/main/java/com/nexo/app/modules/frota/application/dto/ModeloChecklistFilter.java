package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoModeloChecklist;

public record ModeloChecklistFilter(String busca, TipoModeloChecklist tipo, Boolean ativo) {
}
