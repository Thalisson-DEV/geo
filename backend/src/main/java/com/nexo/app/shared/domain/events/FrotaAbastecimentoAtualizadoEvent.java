package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Andamento do abastecimento para quem pediu: reprovado, liberado, cancelado ou vencido.
 * Gatilho {@code frota.abastecimento_atualizado}; o papel {@code solicitante} é quem pediu.
 *
 * @param situacao ex.: "liberado"
 * @param detalhe  frase pronta, ex.: "Pode abastecer no Posto Central até 23h59."
 */
public record FrotaAbastecimentoAtualizadoEvent(
        UUID idAbastecimento,
        String placa,
        String situacao,
        String detalhe,
        UUID idUsuarioSolicitante,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.abastecimento_atualizado";

    @Override
    public String chaveGatilho() {
        return CHAVE_GATILHO;
    }

    @Override
    public UUID idReferencia() {
        return idAbastecimento;
    }

    @Override
    public Map<String, Object> contexto() {
        Map<String, Object> contexto = new HashMap<>();
        contexto.put("placa", placa);
        contexto.put("situacao", situacao);
        contexto.put("detalhe", detalhe);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return idUsuarioSolicitante == null ? Map.of() : Map.of("solicitante", Set.of(idUsuarioSolicitante));
    }
}
