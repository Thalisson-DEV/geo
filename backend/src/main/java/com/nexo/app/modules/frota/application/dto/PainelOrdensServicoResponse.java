package com.nexo.app.modules.frota.application.dto;

import java.util.Map;

/**
 * Contagens do painel de manutenção. {@code pendentesPorCriticidade} tem as quatro
 * criticidades, com zero quando não há OS.
 */
public record PainelOrdensServicoResponse(
        long pendentes,
        Map<String, Long> pendentesPorCriticidade,
        long agendadas,
        long agendadasVencidas,
        long emAndamento,
        long atrasadas,
        long concluidasUltimos30Dias,
        long veiculosParados,
        long aguardandoAprovacao,
        /** Concluídas só com as datas, esperando a causa, o serviço realizado e os valores. */
        long baixaPendente
) {
}
