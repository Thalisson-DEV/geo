package com.nexo.app.shared.domain.events;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * O financeiro aprovou ou reprovou uma compra ou pagamento aberto por uma OS.
 * Gatilho {@code frota.os_orcamento_decidido}; o papel {@code abertura} é quem abriu a OS.
 *
 * @param decisao {@code APROVADA} ou {@code REPROVADA}
 */
public record FrotaOrcamentoOsDecididoEvent(
        UUID idOrdemServico,
        Long numero,
        String placa,
        String decisao,
        String tipoSolicitacao,
        Long numeroSolicitacao,
        BigDecimal valor,
        UUID idUsuarioAbertura,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.os_orcamento_decidido";

    @Override
    public String chaveGatilho() {
        return CHAVE_GATILHO;
    }

    @Override
    public UUID idReferencia() {
        return idOrdemServico;
    }

    @Override
    public Map<String, Object> contexto() {
        Map<String, Object> contexto = new HashMap<>();
        contexto.put("numero", numero);
        contexto.put("placa", placa);
        contexto.put("decisao", decisao);
        contexto.put("decisaoRotulo", "APROVADA".equals(decisao) ? "aprovada" : "reprovada");
        contexto.put("tipoSolicitacao", tipoSolicitacao);
        contexto.put("tipoSolicitacaoRotulo", "PAGAMENTO".equals(tipoSolicitacao)
                ? "solicitação de pagamento" : "solicitação de compra");
        contexto.put("numeroSolicitacao", numeroSolicitacao);
        contexto.put("valor", valor);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return idUsuarioAbertura == null ? Map.of() : Map.of("abertura", Set.of(idUsuarioAbertura));
    }
}
