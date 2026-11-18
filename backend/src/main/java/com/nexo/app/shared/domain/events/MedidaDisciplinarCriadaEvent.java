package com.nexo.app.shared.domain.events;

import java.util.UUID;

/**
 * Uma medida disciplinar foi registrada no RH a pedido de outro módulo.
 *
 * <p>Publicado na mesma transação da criação e só quando o pedido trouxe uma origem
 * (ex.: {@code FROTA_MULTA} + id da multa). O RH não interpreta a origem; quem a reconhece
 * grava o vínculo e, se recusar, desfaz a criação.</p>
 */
public record MedidaDisciplinarCriadaEvent(
        UUID idMedida,
        UUID idColaborador,
        String origemTipo,
        UUID origemId
) {
}
