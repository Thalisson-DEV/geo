package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Um provedor de telemetria ficou mais de uma hora sem sincronizar. Gatilho
 * {@code frota.telemetria_falha}, publicado uma vez por incidente; o próximo sucesso fecha o
 * incidente.
 *
 * @param idReferencia linha de sincronização (provedor + rotina)
 * @param desde        último sucesso, já formatado ("26/10 14:20"), ou "a ativação"
 */
public record FrotaTelemetriaFalhaEvent(
        UUID idReferencia,
        String provedor,
        String desde,
        String mensagem,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.telemetria_falha";

    @Override
    public String chaveGatilho() {
        return CHAVE_GATILHO;
    }

    @Override
    public Map<String, Object> contexto() {
        Map<String, Object> contexto = new HashMap<>();
        contexto.put("provedor", provedor);
        contexto.put("desde", desde);
        contexto.put("mensagem", mensagem == null ? "sem mensagem" : mensagem);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return Map.of();
    }
}
