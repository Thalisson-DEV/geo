package com.nexo.app.modules.financeiro;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Porta pública do financeiro para os módulos que pedem compras e pagamentos (ex.: a
 * OS da frota). Só leitura: criar, submeter e decidir continuam nas telas e regras do
 * financeiro.
 */
public interface FinanceiroApi {

    /** Situação atual das solicitações (compra ou pagamento) informadas, por id. Ids desconhecidos ficam de fora. */
    Map<UUID, ResumoSolicitacaoFinanceira> resumosSolicitacoes(Collection<UUID> ids);

    /** Fornecedores ativos e não bloqueados, ordenados pelo nome. */
    List<FornecedorResumo> fornecedoresUtilizaveis();

    /** Nome de exibição dos fornecedores informados, por id. */
    Map<UUID, String> nomesFornecedores(Collection<UUID> ids);

    /** Local de aquisição e forma de pagamento da compra mais recente com o fornecedor, se houver. */
    java.util.Optional<CondicoesCompraFornecedor> ultimasCondicoesFornecedor(UUID idFornecedor);

    /** Setor / centro de custo (processo) da compra mais recente do veículo, se houver. */
    java.util.Optional<UUID> ultimoProcessoDoVeiculo(UUID idVeiculo);
}
