package com.nexo.app.modules.frota.application.dto;

import java.util.UUID;

public record PostoAbastecimentoFilter(String busca, Boolean ativo, UUID idBaseOperacional) {
}
