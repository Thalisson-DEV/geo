package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** O RH lançou uma medida disciplinar aplicada a um colaborador. Gatilho {@code rh.medida_aplicada}. */
public record RhMedidaDisciplinarAplicadaEvent(
        UUID idMedida,
        String colaborador,
        String tipo,
        String motivo,
        String base,
        String dataFato,
        String link,
        UUID idUsuarioAplicacao
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "rh.medida_aplicada";

    @Override
    public String chaveGatilho() {
        return CHAVE_GATILHO;
    }

    @Override
    public UUID idReferencia() {
        return idMedida;
    }

    @Override
    public Map<String, Object> contexto() {
        Map<String, Object> contexto = new HashMap<>();
        contexto.put("colaborador", colaborador);
        contexto.put("tipo", tipo);
        contexto.put("motivo", motivo);
        contexto.put("base", base);
        contexto.put("dataFato", dataFato);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return idUsuarioAplicacao == null ? Map.of() : Map.of("aplicador", Set.of(idUsuarioAplicacao));
    }
}
