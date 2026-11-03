package com.nexo.app.modules.desconto.application.dto;

import java.util.UUID;

public record DescontoAnexoResponse(
        UUID id,
        String nomeArquivo,
        String url,
        String contentType,
        Long tamanhoBytes,
        /** Termo impresso pelo C.E.S e assinado pelo colaborador (o que finaliza o desconto). */
        boolean termoAssinado
) {}
