package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.OrigemBasePreventiva;
import com.nexo.app.modules.frota.domain.SituacaoPreventiva;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Uma linha do acompanhamento: o plano num veículo, a última realização (a base do ciclo),
 * a próxima e quanto falta. As medições estão no painel em uso (o número que se lê no veículo);
 * o cálculo usa o acumulado, que soma os painéis anteriores. {@code baseMedicao} vem nula quando a
 * realização foi num painel anterior.
 *
 * @param falta texto curto, ex.: "passou 120 km", "faltam 10 dias"
 */
public record ControlePreventivoResponse(
        UUID id,
        UUID idVeiculo,
        String placa,
        String base,
        UUID idPlano,
        String plano,
        String frequencia,
        SituacaoPreventiva situacao,
        String situacaoRotulo,
        boolean semHistorico,
        UnidadeMedicao unidade,
        Long medicaoAtual,
        LocalDate baseData,
        Long baseMedicao,
        OrigemBasePreventiva baseOrigem,
        String baseOrigemRotulo,
        Long proximaMedicao,
        Long faltaMedicao,
        LocalDate proximaData,
        Long faltaDias,
        LocalDate previsao,
        String falta,
        UUID idOrdemServico,
        Long numeroOrdemServico
) {
}
