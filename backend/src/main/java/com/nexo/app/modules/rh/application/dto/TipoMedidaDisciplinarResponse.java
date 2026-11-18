package com.nexo.app.modules.rh.application.dto;

import java.util.UUID;

public record TipoMedidaDisciplinarResponse(UUID id, String nome, Integer gravidade, boolean exigePeriodo, boolean ativo) {
}
