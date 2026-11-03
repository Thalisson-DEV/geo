package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.Combustivel;
import com.nexo.app.modules.frota.domain.RegimeVeiculo;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Linha da listagem de veículos da frota. */
public record VeiculoFrotaResumoResponse(
        UUID idVeiculo,
        String placa,
        String modelo,
        String fabricante,
        UUID idBaseOperacional,
        String baseOperacional,
        UUID idTipoVeiculo,
        String tipoVeiculo,
        SituacaoOperacional situacao,
        RegimeVeiculo regime,
        Combustivel combustivel,
        Integer anoModelo,
        Long kmAtual,
        OffsetDateTime kmAtualEm,
        UUID idCondutorAtual,
        String condutorAtual,
        List<String> implementosAcoplados,
        long documentosVencidos,
        long documentosAVencer,
        long leiturasInconsistentes,
        boolean ativo,
        /** Odômetro em km ou horímetro em horas; {@code kmAtual} está nesta unidade. */
        UnidadeMedicao unidadeMedicao,
        /** Valor atual somado ao que os painéis anteriores rodaram (trocas de painel). */
        Long acumulado,
        /** Uso nos últimos 30 dias pela telemetria; nulo sem rastreador medindo o veículo. */
        UsoRecente uso
) {

    /** {@code rodaPouco}: menos de 20 km por dia útil medido (com ao menos 5 dias medidos). */
    public record UsoRecente(double km, double kmPorDiaUtil, double kmForaExpediente, int diasForaExpediente,
                             boolean rodaPouco) {
    }
}
