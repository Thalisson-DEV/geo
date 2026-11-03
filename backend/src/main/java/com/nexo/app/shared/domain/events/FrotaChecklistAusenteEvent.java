package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Veículos de uma base usados hoje sem checklist do dia. Gatilho {@code frota.checklist_ausente},
 * publicado uma vez por dia e por base pelo aviso diário da frota.
 *
 * @param idReferencia base operacional (ou um id fixo para veículos sem base)
 * @param placas       lista para o texto, ex.: "ABC1D23, DEF4G56"
 */
public record FrotaChecklistAusenteEvent(
        UUID idReferencia,
        int quantidade,
        String base,
        String placas,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.checklist_ausente";

    @Override
    public String chaveGatilho() {
        return CHAVE_GATILHO;
    }

    @Override
    public Map<String, Object> contexto() {
        Map<String, Object> contexto = new HashMap<>();
        contexto.put("quantidade", quantidade);
        contexto.put("base", base);
        contexto.put("placas", placas);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return Map.of();
    }
}
