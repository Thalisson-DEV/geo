package com.nexo.app.modules.frota.application.dto;

/** Filtro da lista de planos: busca pelo nome e situação do cadastro (nulo = todos). */
public record PlanoPreventivoFilter(String busca, Boolean ativo) {
}
