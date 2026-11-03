package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Evento de condução importado da telemetria. Gatilho {@code frota.telemetria_evento}, publicado
 * uma vez por evento (a importação não duplica). A regra de fábrica vem desligada.
 *
 * @param idReferencia evento de telemetria
 * @param tipo         rótulo do tipo ("Excesso de velocidade")
 * @param codigoTipo   nome do tipo, para condições da regra ("EXCESSO_VELOCIDADE")
 * @param ocorridoEm   já formatado ("26/10 14:20")
 * @param condutor     nome do condutor ou "condutor não identificado"
 */
public record FrotaTelemetriaEventoEvent(
        UUID idReferencia,
        String tipo,
        String codigoTipo,
        String placa,
        String ocorridoEm,
        String condutor,
        String detalhe,
        String base,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.telemetria_evento";

    @Override
    public String chaveGatilho() {
        return CHAVE_GATILHO;
    }

    @Override
    public Map<String, Object> contexto() {
        Map<String, Object> contexto = new HashMap<>();
        contexto.put("tipo", tipo);
        contexto.put("codigoTipo", codigoTipo);
        contexto.put("placa", placa == null ? "veículo sem placa" : placa);
        contexto.put("ocorridoEm", ocorridoEm);
        contexto.put("condutor", condutor);
        contexto.put("detalhe", detalhe == null ? "" : detalhe);
        contexto.put("base", base == null ? "sem base" : base);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return Map.of();
    }
}
