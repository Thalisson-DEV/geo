package com.nexo.app.modules.frota.application.events;

import com.nexo.app.modules.frota.domain.AlvoAnaliseIa;

import java.util.UUID;

/**
 * O registro chegou com o que a Bússola precisa (as fotos esperadas): a análise roda sozinha
 * depois do commit, sem o gestor pedir. Evento interno do módulo.
 */
public record AnaliseIaPedida(AlvoAnaliseIa alvo, UUID idAlvo) {
}
