package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Uma OS em andamento passou da previsão de término. Publicado uma vez por previsão
 * pelo job da frota. Gatilho {@code frota.os_prazo_estourado}.
 */
public record FrotaPrazoOsEstouradoEvent(
        UUID idOrdemServico,
        Long numero,
        String placa,
        String base,
        String previsaoTermino,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.os_prazo_estourado";

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
        contexto.put("base", base);
        contexto.put("previsaoTermino", previsaoTermino);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return Map.of();
    }
}
