package com.nexo.app.modules.frota.application.dto;

import java.util.List;
import java.util.UUID;

/**
 * Resultado do envio pelo app. {@code fotosPendentes} lista os ids do aparelho das fotos que
 * ainda faltam enviar; a medição inconsistente é aceita e o motivo volta para o app avisar.
 */
public record ChecklistRegistradoResponse(
        UUID id,
        UUID idAparelho,
        String placa,
        boolean passagemVeiculo,
        int pendencias,
        boolean medicaoValida,
        String motivoMedicao,
        List<UUID> fotosPendentes
) {
}
