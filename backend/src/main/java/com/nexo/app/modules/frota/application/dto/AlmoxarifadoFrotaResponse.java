package com.nexo.app.modules.frota.application.dto;

import java.util.UUID;

public record AlmoxarifadoFrotaResponse(UUID id, String nome, UUID idBaseOperacional, String baseOperacional, boolean ativo) {
}
