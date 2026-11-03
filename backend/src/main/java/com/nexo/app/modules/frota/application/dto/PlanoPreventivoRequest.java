package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.Criticidade;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Cadastro do plano preventivo. Vale para os tipos de veículo e para os veículos com um
 * implemento dos tipos informados acoplado; vence pelo que chegar primeiro (km, horas ou dias).
 */
public record PlanoPreventivoRequest(
        @NotBlank(message = "Informe o nome do plano.") @Size(max = 120) String nome,
        @Size(max = 1000) String descricao,
        Set<@NotNull UUID> idsTiposVeiculo,
        Set<@NotNull UUID> idsTiposImplemento,
        Long intervaloKm,
        Long intervaloHoras,
        Integer intervaloDias,
        @PositiveOrZero Long antecedenciaKm,
        @PositiveOrZero Long antecedenciaHoras,
        @PositiveOrZero Integer antecedenciaDias,
        Criticidade criticidade,
        boolean abrirOsAutomaticamente,
        @NotEmpty(message = "Inclua ao menos um item de manutenção no plano.") @Size(max = 30) List<@NotNull UUID> idsItem,
        @Size(max = 50, message = "O roteiro aceita no máximo 50 tarefas.") List<@Size(max = 300) String> tarefas
) {
}
