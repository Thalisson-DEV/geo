package com.nexo.app.modules.assistente.application.aprovacao;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Uma fila de aprovacao de um modulo (ex.: solicitacoes de pagamento). A decisao passa pelos casos de uso do
 * modulo, com as mesmas regras, historico, avisos e e-mails da tela; quem decide e sempre o usuario informado.
 */
public interface ProvedorAprovacoes {

    /** Identificador curto e estavel usado pelo modelo ("compra", "pagamento"). */
    String tipo();

    /** Nome para o usuario ("Solicitação de pagamento"). */
    String rotulo();

    String modulo();

    /** Quem pode decidir esta fila: basta possuir uma. */
    Set<String> autoridades();

    /** O que esta aguardando decisao, do mais antigo para o mais novo. */
    List<SolicitacaoEmAprovacao> pendentes(int limite);

    /** A solicitacao pelo numero que o usuario ve na tela, aguardando ou nao, com a ficha completa. */
    Optional<SolicitacaoEmAprovacao> buscar(long numero);

    /**
     * Aprova ou rejeita em nome de {@code usuarioId}. Regra do modulo que recusar a decisao lanca excecao com a
     * mensagem para o usuario.
     */
    SolicitacaoEmAprovacao decidir(UUID id, Decisao decisao, UUID usuarioId);
}
