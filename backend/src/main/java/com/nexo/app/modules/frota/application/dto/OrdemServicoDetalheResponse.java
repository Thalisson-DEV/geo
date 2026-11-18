package com.nexo.app.modules.frota.application.dto;

import java.util.List;

/**
 * Ficha completa da OS. {@code avisos} traz o que a última ação gerou e a tela deve
 * mostrar (ex.: KM gravado como inconsistente); nas leituras vem vazio.
 */
public record OrdemServicoDetalheResponse(
        OrdemServicoResponse ordem,
        List<ItemOrdemServicoResponse> itens,
        List<OrcamentoOrdemServicoResponse> orcamentos,
        List<HistoricoOrdemServicoResponse> historico,
        /** Valor atual do painel do veículo, na unidade da OS. */
        Long kmAtualVeiculo,
        List<String> avisos,
        /** Mão de obra lançada na execução. */
        List<ServicoOrdemServicoResponse> servicos,
        /** Peças e consumíveis lançados na execução. */
        List<PecaOrdemServicoResponse> pecas,
        TotaisOrdemServicoResponse totais,
        /** Planos preventivos que a OS cobre, com o roteiro de inspeção copiado na abertura. */
        List<PreventivaOrdemServicoResponse> preventivas,
        /** Sinistro que abriu a OS de reparo (origem SINISTRO); nulo nas demais. */
        SinistroDaOrdem sinistro,
        /**
         * O que falta para a OS ficar finalizada (valor de serviço ou peça, valor da OS, causa e
         * serviço realizado). Na concluída, não vazia = valores pendentes; na aberta, é o que vai
         * ficar pendente se concluir agora.
         */
        List<String> pendencias
) {
    public record SinistroDaOrdem(java.util.UUID id, Long numero, String tipo, String situacao) {
    }
}
