package com.nexo.app.modules.frota.application.dto;

import java.util.UUID;

/** Plano coberto por uma OS preventiva, com o roteiro copiado na abertura. */
public record PreventivaOrdemServicoResponse(UUID idControle, UUID idPlano, String plano, String roteiro, String situacaoRotulo) {
}
