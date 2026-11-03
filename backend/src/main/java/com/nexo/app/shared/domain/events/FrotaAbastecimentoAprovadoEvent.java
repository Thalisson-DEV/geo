package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Abastecimento aprovado, à espera da liberação. Gatilho {@code frota.abastecimento_aprovado}. */
public record FrotaAbastecimentoAprovadoEvent(
        UUID idAbastecimento,
        String placa,
        String itens,
        String posto,
        String aprovador,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.abastecimento_aprovado";

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
        contexto.put("itens", itens);
        contexto.put("posto", posto);
        contexto.put("aprovador", aprovador);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return Map.of();
    }
}
