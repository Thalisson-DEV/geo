package com.nexo.app.modules.frota.domain;

/** O que aconteceu com a OS, para o histórico. */
public enum TipoEventoOrdemServico {
    ABERTA("Aberta"),
    EDITADA("Editada"),
    AGENDADA("Agendada"),
    INICIADA("Iniciada"),
    PREVISAO_ALTERADA("Previsão alterada"),
    CONCLUIDA("Concluída"),
    CANCELADA("Cancelada"),
    VEICULO_PARADO("Veículo parado"),
    VEICULO_LIBERADO("Veículo liberado"),
    ORCAMENTO_VINCULADO("Orçamento vinculado"),
    ORCAMENTO_APROVADO("Orçamento aprovado"),
    ORCAMENTO_REPROVADO("Orçamento reprovado"),
    EXECUCAO_ALTERADA("Execução alterada"),
    DOCUMENTO_FISCAL_INCLUIDO("Documento fiscal incluído"),
    DOCUMENTO_FISCAL_EXCLUIDO("Documento fiscal excluído");

    private final String rotulo;

    TipoEventoOrdemServico(String rotulo) {
        this.rotulo = rotulo;
    }

    public String getRotulo() {
        return rotulo;
    }
}
