package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.shared.application.SelecaoMultipla;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Filtro das OS. {@code busca} procura na placa, no número, na descrição e na oficina;
 * {@code atrasadas} traz as em andamento com previsão vencida; {@code veiculoParado}, as
 * que mantêm o veículo parado agora; {@code comRepeticao}, as que repetiram algum item.
 */
public record OrdemServicoFilter(
        String busca,
        List<UUID> idsBase,
        List<SituacaoOrdemServico> situacoes,
        List<Criticidade> criticidades,
        List<TipoManutencao> tiposManutencao,
        List<OrigemOrdemServico> origens,
        List<UUID> idsItem,
        UUID idVeiculo,
        UUID idCondutor,
        OffsetDateTime abertaDe,
        OffsetDateTime abertaAte,
        Boolean atrasadas,
        Boolean veiculoParado,
        Boolean comRepeticao,
        /** Só as OS não veiculares (ferramental, oficina, equipamento sem placa). */
        Boolean semVeiculo,
        /** Período de conclusão (fim real): o quadro mostra as concluídas da última semana. */
        OffsetDateTime concluidaDe,
        OffsetDateTime concluidaAte,
        /** Concluídas com a baixa pendente (verdadeiro) ou já finalizadas (falso). */
        Boolean baixaPendente
) {
    public OrdemServicoFilter(String busca, List<UUID> idsBase, List<SituacaoOrdemServico> situacoes,
                              List<Criticidade> criticidades, List<TipoManutencao> tiposManutencao,
                              List<OrigemOrdemServico> origens, List<UUID> idsItem, UUID idVeiculo, UUID idCondutor,
                              OffsetDateTime abertaDe, OffsetDateTime abertaAte, Boolean atrasadas,
                              Boolean veiculoParado, Boolean comRepeticao) {
        this(busca, idsBase, situacoes, criticidades, tiposManutencao, origens, idsItem, idVeiculo, idCondutor,
                abertaDe, abertaAte, atrasadas, veiculoParado, comRepeticao, null, null, null, null);
    }

    public OrdemServicoFilter {
        idsBase = SelecaoMultipla.normalizar(idsBase);
        situacoes = SelecaoMultipla.normalizar(situacoes);
        criticidades = SelecaoMultipla.normalizar(criticidades);
        tiposManutencao = SelecaoMultipla.normalizar(tiposManutencao);
        origens = SelecaoMultipla.normalizar(origens);
        idsItem = SelecaoMultipla.normalizar(idsItem);
    }
}
