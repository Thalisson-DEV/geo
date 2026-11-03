package com.nexo.app.modules.frota.application.dto;

import java.util.List;

/** Listas fechadas usadas nos formulários e filtros da frota. */
public record OpcoesFrotaResponse(
        List<OpcaoFrota> situacoes,
        List<OpcaoFrota> regimes,
        List<OpcaoFrota> combustiveis,
        List<OpcaoFrota> provedoresTelemetria,
        List<OpcaoFrota> categoriasCnh,
        List<OpcaoFrota> tiposDocumento,
        List<OpcaoFrota> origensOdometro,
        List<OpcaoFrota> situacoesOrdemServico,
        List<OpcaoFrota> criticidades,
        List<OpcaoFrota> tiposManutencao,
        List<OpcaoFrota> origensOrdemServico,
        List<OpcaoFrota> tiposOficina,
        List<OpcaoFrota> motivosServico,
        List<OpcaoFrota> naturezasServico,
        List<OpcaoFrota> situacoesAprovacao,
        List<OpcaoFrota> causasManutencao,
        List<OpcaoFrota> origensPeca,
        List<OpcaoFrota> tiposSinistro,
        List<OpcaoFrota> situacoesSinistro
) {
}
