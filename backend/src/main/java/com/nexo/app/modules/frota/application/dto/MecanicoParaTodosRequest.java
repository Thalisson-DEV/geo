package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.Size;

import java.util.UUID;

/** "Mesmo mecânico para todos": colaborador (oficina interna) ou nome (oficina externa). */
public record MecanicoParaTodosRequest(UUID idMecanico, @Size(max = 120) String mecanicoNome) {
}
