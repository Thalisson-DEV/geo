package com.nexo.app.modules.frota.application.dto;

import java.util.List;
import java.util.UUID;

/**
 * Filtro do acompanhamento. {@code situacao}: VENCIDA, PROXIMA, EM_DIA, COM_OS ou
 * SEM_HISTORICO (vazio = todas). {@code busca} procura pela placa.
 */
public record AcompanhamentoPreventivaFilter(
        List<String> situacao,
        List<UUID> idBase,
        UUID idPlano,
        UUID idVeiculo,
        String busca
) {
}
