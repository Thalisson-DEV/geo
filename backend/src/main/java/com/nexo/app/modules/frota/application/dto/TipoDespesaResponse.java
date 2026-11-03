package com.nexo.app.modules.frota.application.dto;

import java.util.List;
import java.util.UUID;

/** Tipo de despesa com os subtipos ativos. {@code codigo} só nos tipos padrão. */
public record TipoDespesaResponse(UUID id, String nome, String codigo, boolean ativo, List<Subtipo> subtipos) {

    public record Subtipo(UUID id, String nome) {
    }
}
