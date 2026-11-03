package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Uma OS concluída repetiu um item feito na mesma placa dentro da janela de repetição.
 * Um evento por item repetido. Gatilho {@code frota.manutencao_repetida}.
 */
public record FrotaManutencaoRepetidaEvent(
        UUID idOrdemServico,
        UUID idItemManutencao,
        Long numero,
        String placa,
        String item,
        Long numeroOsAnterior,
        int diasDesdeAnterior,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.manutencao_repetida";

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
        contexto.put("item", item);
        contexto.put("numeroOsAnterior", numeroOsAnterior);
        contexto.put("diasDesdeAnterior", diasDesdeAnterior);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return Map.of();
    }
}
