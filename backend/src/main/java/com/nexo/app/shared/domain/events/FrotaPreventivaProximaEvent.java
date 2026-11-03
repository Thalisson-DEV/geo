package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Preventiva de um veículo ficou próxima ou venceu. Gatilho {@code frota.preventiva_proxima},
 * publicado uma vez por controle, etapa e ciclo pelo job diário da preventiva.
 *
 * @param idReferencia controle preventivo (veículo + plano)
 * @param situacao     "próxima" ou "vencida", já no texto do aviso
 * @param falta        ex.: "faltam 800 km", "passou 12 dias"
 */
public record FrotaPreventivaProximaEvent(
        UUID idReferencia,
        String placa,
        String plano,
        String situacao,
        String falta,
        String base,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.preventiva_proxima";

    @Override
    public String chaveGatilho() {
        return CHAVE_GATILHO;
    }

    @Override
    public Map<String, Object> contexto() {
        Map<String, Object> contexto = new HashMap<>();
        contexto.put("placa", placa);
        contexto.put("plano", plano);
        contexto.put("situacao", situacao);
        contexto.put("falta", falta);
        contexto.put("base", base == null ? "sem base" : base);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return Map.of();
    }
}
