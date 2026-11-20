package com.nexo.app.modules.assistente.infrastructure.persistence;

import com.nexo.app.modules.assistente.domain.ArquivoAssistente;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Metadados de um arquivo da conversa, sem o texto extraido nem os dados tabulares. Listar a conversa
 * carregava essas colunas de todos os arquivos (dezenas de MB em analises com muitas planilhas) sem usa-las.
 */
public record ArquivoResumo(UUID id, String codigo, UUID conversaId, ArquivoAssistente.Origem origem, String nome,
        String tipoConteudo, ArquivoAssistente.Categoria categoria, long tamanhoBytes,
        ArquivoAssistente.Armazenamento armazenamento, String chaveArmazenamento, ArquivoAssistente.Status status,
        String erro, String resumoJson, OffsetDateTime dataCriacao) {
}
