package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Uma OS de manutenção foi aberta. Gatilho {@code frota.os_aberta}; as regras podem
 * filtrar por {@code criticidade} para separar as urgentes.
 */
public record FrotaOrdemServicoAbertaEvent(
        UUID idOrdemServico,
        Long numero,
        String placa,
        String base,
        String criticidade,
        String criticidadeRotulo,
        String tipoManutencao,
        String descricao,
        String link
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.os_aberta";

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
        contexto.put("criticidade", criticidade);
        contexto.put("criticidadeRotulo", criticidadeRotulo);
        contexto.put("tipoManutencao", tipoManutencao);
        contexto.put("descricao", descricao);
        contexto.put("link", link);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        return Map.of();
    }
}
