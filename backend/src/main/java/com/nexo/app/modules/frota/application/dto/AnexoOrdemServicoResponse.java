package com.nexo.app.modules.frota.application.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Anexo da OS para a lista: o que é, o arquivo e quem enviou. */
public record AnexoOrdemServicoResponse(
        UUID id,
        String descricao,
        String arquivoNome,
        String arquivoContentType,
        Long arquivoTamanhoBytes,
        OffsetDateTime enviadoEm,
        String enviadoPor
) {
}
