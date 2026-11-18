package com.nexo.app.modules.rh;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * O que outro módulo precisa para mostrar a medida vinculada: em que pé ela está.
 *
 * @param situacao {@code APLICADA} ou {@code CANCELADA}
 */
public record ResumoMedidaDisciplinar(
        UUID id,
        String situacao,
        String situacaoRotulo,
        String tipo,
        int gravidade,
        LocalDate dataFato,
        LocalDate dataAplicacao
) {
}
