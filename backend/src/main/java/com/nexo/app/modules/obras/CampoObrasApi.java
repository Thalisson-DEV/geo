package com.nexo.app.modules.obras;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Porta do envio durável para os registros do app de campo de Obras. Recebe o comando como o aparelho mandou e o
 * aplica pelo mesmo caso de uso da API direta (idempotente pelo id do aparelho).
 */
public interface CampoObrasApi {

    /** Tipos de comando de campo, na ordem em que a fila do app os envia por obra. */
    enum Comando { APR, APR_CONCLUSAO, OCORRENCIA, ATIVIDADE, APONTAMENTO, PRESENCA, EVIDENCIA, RELATORIO }

    /** Arquivo que acompanha o comando (a foto da evidência). */
    record Arquivo(String nome, String contentType, byte[] conteudo) {
    }

    /** @param ids registros gravados; {@code jaRecebido} quando o comando era repetição. */
    record Aplicado(List<UUID> ids, boolean jaRecebido) {
    }

    Aplicado aplicar(Comando comando, Map<String, Object> payload, UUID atorOrigem, Arquivo arquivo);
}
