package com.nexo.app.modules.execucao.application.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Abertura de turno. O responsável pode confirmar a composição da equipe no mesmo
 * passo: {@code idVeiculo} troca o veículo e {@code idsColaboradores} define a lista
 * completa de parceiros. Campos nulos mantêm a composição cadastrada.
 *
 * <p>{@code idLider} e {@code idsSubstitutos} registram quem liderou e quem veio de fora da
 * equipe. {@code dataInicio} é a hora em que o turno foi aberto no aparelho sem sinal; sem ela,
 * vale a hora do servidor.</p>
 */
public record AbrirTurnoRequest(
    UUID idEquipe,
    UUID idVeiculo,
    List<UUID> idsColaboradores,
    UUID idLider,
    List<UUID> idsSubstitutos,
    OffsetDateTime dataInicio
) {
    public AbrirTurnoRequest(UUID idEquipe) {
        this(idEquipe, null, null, null, null, null);
    }

    public AbrirTurnoRequest(UUID idEquipe, UUID idVeiculo, List<UUID> idsColaboradores) {
        this(idEquipe, idVeiculo, idsColaboradores, null, null, null);
    }
}
