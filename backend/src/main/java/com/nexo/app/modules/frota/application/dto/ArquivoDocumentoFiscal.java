package com.nexo.app.modules.frota.application.dto;

import java.io.InputStream;

/** Arquivo do documento fiscal para download. */
public record ArquivoDocumentoFiscal(String nome, String contentType, long tamanhoBytes, InputStream conteudo) {
}
