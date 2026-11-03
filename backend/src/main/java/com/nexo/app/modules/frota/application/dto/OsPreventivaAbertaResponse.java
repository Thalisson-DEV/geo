package com.nexo.app.modules.frota.application.dto;

import java.util.List;
import java.util.UUID;

/** OS abertas pela preventiva: uma por veículo, com os planos que cada uma cobre. */
public record OsPreventivaAbertaResponse(List<Ordem> ordens) {
    /** {@code incluida}: os planos entraram numa OS preventiva do veículo que ainda não tinha começado. */
    public record Ordem(UUID id, Long numero, String placa, List<String> planos, boolean incluida) {
    }
}
