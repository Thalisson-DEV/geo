package com.nexo.app.modules.rh.application.dto;

import java.io.InputStream;

/** Anexo baixado do armazenamento, pronto para a resposta HTTP. */
public record ArquivoMedidaDisciplinar(String nome, String contentType, Long tamanhoBytes, InputStream conteudo) {
}
