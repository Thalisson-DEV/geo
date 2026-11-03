package com.nexo.app.modules.frota.domain;

import java.util.Collection;

/**
 * Onde está a aprovação financeira da OS, calculada a partir das solicitações
 * vinculadas (compras e pagamentos). Quem decide é o financeiro; a frota só lê.
 */
public enum SituacaoAprovacaoOrcamento {
    SEM_ORCAMENTO("Pendente de orçamento"),
    EM_ORCAMENTO("Orçamento em preparação"),
    AGUARDANDO_APROVACAO("Aguardando aprovação"),
    APROVADO("Aprovado"),
    REPROVADO("Reprovado");

    private final String rotulo;

    SituacaoAprovacaoOrcamento(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }

    /**
     * Uma pendente de decisão domina: enquanto houver algo aguardando, a OS está
     * aguardando, mesmo com outra compra já aprovada.
     *
     * @param statusSolicitacoes status do financeiro ({@code RASCUNHO}, {@code SOLICITADO},
     *                           {@code APROVADO}, {@code REJEITADO}, {@code CANCELADO})
     */
    public static SituacaoAprovacaoOrcamento de(Collection<String> statusSolicitacoes) {
        if (statusSolicitacoes == null || statusSolicitacoes.isEmpty()) return SEM_ORCAMENTO;
        if (statusSolicitacoes.contains("SOLICITADO")) return AGUARDANDO_APROVACAO;
        if (statusSolicitacoes.contains("RASCUNHO")) return EM_ORCAMENTO;
        if (statusSolicitacoes.contains("APROVADO")) return APROVADO;
        if (statusSolicitacoes.contains("REJEITADO")) return REPROVADO;
        return SEM_ORCAMENTO;
    }

    /** Solicitação que ainda vai ser decidida e por isso impede cancelar a OS. */
    public static boolean pendente(String status) {
        return "RASCUNHO".equals(status) || "SOLICITADO".equals(status);
    }
}
