package com.nexo.app.shared.domain.events;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Uma OS foi agendada ou reagendada. Gatilho {@code frota.os_agendada}. */
public record FrotaOrdemServicoAgendadaEvent(
        UUID idOrdemServico,
        Long numero,
        String placa,
        String base,
        String dataAgendamento,
        String local,
        String link,
        /** Oficina ou fornecedor que vai fazer o serviço ("Oficina interna", "Toyota Juazeiro"). */
        String oficina,
        String criticidade,
        String descricao,
        /** Usuários do supervisor e do coordenador da equipe que usa o veículo. */
        Set<UUID> supervisores,
        Set<UUID> coordenadores
) implements EventoNotificavel {

    public static final String CHAVE_GATILHO = "frota.os_agendada";

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
        contexto.put("dataAgendamento", dataAgendamento);
        contexto.put("local", local);
        // Pronto para a frase: " em Oficina X" ou vazio, sem condicional no template.
        contexto.put("localTexto", local == null || local.isBlank() ? "" : " em " + local);
        contexto.put("link", link);
        contexto.put("oficina", oficina == null ? "" : oficina);
        contexto.put("criticidade", criticidade == null ? "" : criticidade);
        contexto.put("descricao", descricao == null ? "" : descricao);
        return contexto;
    }

    @Override
    public Map<String, Set<UUID>> papeis() {
        Map<String, Set<UUID>> papeis = new HashMap<>();
        if (supervisores != null && !supervisores.isEmpty()) papeis.put("supervisorVeiculo", supervisores);
        if (coordenadores != null && !coordenadores.isEmpty()) papeis.put("coordenadorVeiculo", coordenadores);
        return papeis;
    }
}
