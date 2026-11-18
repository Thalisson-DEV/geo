package com.nexo.app.modules.estoque.application.dto;

import java.util.UUID;

public record TrocaOcorrenciaTecnicaResponse(UUID idSolicitacao, String ocorrenciaAnterior, String ocorrencia, Long versao) {
}
