package com.nexo.app.modules.frota.application.dto;

import java.io.InputStream;

/** Arquivo do anexo para download. */
public record ArquivoAnexoDespesa(String nome, String contentType, long tamanhoBytes, InputStream conteudo) {
}
