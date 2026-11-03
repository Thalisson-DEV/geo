package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Pedido de abastecimento feito pelo app. Gatilho {@code frota.abastecimento_solicitado}; o papel
 * {@code aprovadores} são os donos das carteiras que têm a placa.
 *
 * @param itens   ex.: "Diesel S10 60 l, ARLA 32 20 l"
 * @param alertas texto já pronto (" Atenção: ..."), vazio quando não há
 */
public record FrotaAbastecimentoSolicitadoEvent(
        UUID idAbastecimento,
        String placa,
        String solicitante,
        String itens,
        String posto,
        String alertas,
        Set<UUID> aprovadores,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.abastecimento_solicitado";

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
        contexto.put("solicitante", solicitante);
        contexto.put("itens", itens);
        contexto.put("posto", posto);
        contexto.put("alertas", alertas == null ? "" : alertas);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return aprovadores == null || aprovadores.isEmpty() ? Map.of() : Map.of("aprovadores", Set.copyOf(aprovadores));
    }
}
