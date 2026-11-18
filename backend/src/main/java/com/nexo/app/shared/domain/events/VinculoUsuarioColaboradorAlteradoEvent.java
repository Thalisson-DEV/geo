package com.nexo.app.shared.domain.events;

import java.util.UUID;

/**
 * Evento de integração (Shared): IAM avisa ao RH que um acesso existente trocou de
 * colaborador. Qualquer um dos lados pode ser nulo — sem colaborador anterior (vínculo
 * novo) ou sem colaborador novo (vínculo desfeito).
 */
public record VinculoUsuarioColaboradorAlteradoEvent(
    UUID usuarioId,
    UUID colaboradorAnteriorId,
    UUID colaboradorNovoId
) {
}
