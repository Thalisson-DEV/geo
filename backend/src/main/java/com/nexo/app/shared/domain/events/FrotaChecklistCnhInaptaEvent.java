package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Checklist de uso aceito com a CNH do condutor vencida, ausente ou de categoria abaixo da
 * exigida. Gatilho {@code frota.checklist_cnh_inapta}: o checklist vale, o abastecimento não.
 *
 * @param situacao ex.: "CNH vencida"
 * @param detalhe  ex.: "A CNH venceu em 20/10/2026."
 */
public record FrotaChecklistCnhInaptaEvent(
        UUID idChecklist,
        String placa,
        String condutor,
        String situacao,
        String detalhe,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.checklist_cnh_inapta";

    @Override
    public String chaveGatilho() {
        return CHAVE_GATILHO;
    }

    @Override
    public UUID idReferencia() {
        return idChecklist;
    }

    @Override
    public Map<String, Object> contexto() {
        Map<String, Object> contexto = new HashMap<>();
        contexto.put("placa", placa);
        contexto.put("condutor", condutor);
        contexto.put("situacao", situacao);
        contexto.put("detalhe", detalhe);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, java.util.Set<UUID>> papeis() {
        return Map.of();
    }
}
