package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoEventoAgendaFrota;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Eventos do calendário da frota no período pedido.
 *
 * @param truncado há mais eventos que o limite; a tela pede para reduzir o recorte
 */
public record AgendaFrotaResponse(List<Evento> eventos, boolean truncado) {

    /**
     * @param data         dia civil do evento (fuso de Brasília)
     * @param instante     hora marcada, quando houver (OS)
     * @param idReferencia OS, documento ou condutor
     * @param tom          info, warning, danger, success ou neutral
     * @param atrasado     a data já passou sem o evento acontecer
     */
    public record Evento(TipoEventoAgendaFrota tipo, String tipoRotulo, LocalDate data, OffsetDateTime instante,
                         String titulo, String detalhe, String placa, String base, UUID idReferencia, Long numeroOs,
                         String tom, boolean atrasado) {
    }
}
