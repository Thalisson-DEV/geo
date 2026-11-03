package com.nexo.app.modules.frota.application.dto;

import java.io.InputStream;

/** Foto do checklist para exibir ou baixar. */
public record ArquivoFotoChecklist(String nome, String contentType, long tamanhoBytes, InputStream conteudo) {
}
