package com.nexo.app.modules.frota.application.dto;

import java.util.List;
import java.util.UUID;

/**
 * Modelos que o veículo usa. Sem principal, o veículo não tem checklist configurado;
 * com mais de um, quem preenche escolhe.
 */
public record ModelosVeiculoChecklistResponse(
        UUID idVeiculo,
        List<ModeloChecklistResumoResponse> principais,
        List<ModeloChecklistResumoResponse> adicionais,
        boolean exigeEscolha
) {
}
