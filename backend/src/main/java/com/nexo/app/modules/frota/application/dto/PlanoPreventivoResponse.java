package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.Criticidade;

import java.util.List;
import java.util.UUID;

/**
 * Plano preventivo com os nomes resolvidos. {@code frequencia} é o texto pronto
 * (ex.: "a cada 10.000 km ou 180 dias"); {@code veiculos}, quantos veículos ele acompanha.
 */
public record PlanoPreventivoResponse(
        UUID id,
        String nome,
        String descricao,
        List<Referencia> tiposVeiculo,
        List<Referencia> tiposImplemento,
        Long intervaloKm,
        Long intervaloHoras,
        Integer intervaloDias,
        Long antecedenciaKm,
        Long antecedenciaHoras,
        Integer antecedenciaDias,
        String frequencia,
        Criticidade criticidade,
        String criticidadeRotulo,
        boolean abrirOsAutomaticamente,
        List<Referencia> itens,
        List<String> tarefas,
        long veiculos,
        boolean ativo
) {
    public record Referencia(UUID id, String nome, boolean ativo) {
    }
}
