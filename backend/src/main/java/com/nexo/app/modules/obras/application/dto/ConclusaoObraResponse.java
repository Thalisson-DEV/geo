package com.nexo.app.modules.obras.application.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * O que falta para a obra concluir: serviços planejados em aberto, fotos obrigatórias (modelo que trava) e ocorrências
 * que esperam decisão do escritório. Sem pendência e com todos os serviços executados, a obra conclui sozinha.
 */
public record ConclusaoObraResponse(
        boolean concluida,
        long servicos,
        long servicosAbertos,
        List<FotoPendente> fotos,
        List<OcorrenciaPendente> ocorrencias
) {
    public record FotoPendente(UUID idPonto, String numeroPonto, String titulo, String motivoReprovacao) {
    }

    public record OcorrenciaPendente(UUID id, String tipo, String rotulo, String descricao, OffsetDateTime registradaEm) {
    }
}
