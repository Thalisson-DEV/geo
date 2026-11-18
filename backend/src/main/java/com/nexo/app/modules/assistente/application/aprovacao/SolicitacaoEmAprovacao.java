package com.nexo.app.modules.assistente.application.aprovacao;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * O que o aprovador precisa ver para saber exatamente o que esta decidindo.
 *
 * @param titulo     como a tela chama ("Pagamento nº 1234")
 * @param situacao   situacao legivel ("Aguardando aprovação", "Aprovada")
 * @param aguardando ainda espera decisao
 * @param caminho    rota da tela de detalhe
 * @param ficha      a solicitacao inteira em pares rotulo/valor (vazia na listagem)
 */
public record SolicitacaoEmAprovacao(UUID id, long numero, String titulo, String situacao, boolean aguardando,
        String solicitante, String fornecedor, BigDecimal valor, BigDecimal valorAprovado, String descricao, String base,
        OffsetDateTime enviadaEm, String caminho, List<Campo> ficha) {

    public record Campo(String rotulo, String valor) {
    }

    public SolicitacaoEmAprovacao {
        ficha = ficha == null ? List.of() : List.copyOf(ficha);
    }
}
