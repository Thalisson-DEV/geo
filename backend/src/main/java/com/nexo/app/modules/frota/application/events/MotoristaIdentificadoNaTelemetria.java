package com.nexo.app.modules.frota.application.events;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * O rastreador passou a informar outro motorista (cartão de identificação do condutor), já casado
 * com um colaborador. Interno à frota: vira o condutor do veículo a partir do instante da leitura.
 */
public record MotoristaIdentificadoNaTelemetria(UUID idVeiculo, UUID idColaborador, OffsetDateTime em, UUID idRastreador) {
}
