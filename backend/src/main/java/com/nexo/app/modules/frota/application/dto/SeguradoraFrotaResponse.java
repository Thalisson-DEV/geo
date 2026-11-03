package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.PapelSeguradora;

import java.util.UUID;

public record SeguradoraFrotaResponse(
        UUID id,
        UUID idFornecedor,
        String nome,
        PapelSeguradora papel,
        String papelRotulo,
        String telefoneAssistencia,
        String observacao,
        /** Apólices em vigor hoje em que ela é a seguradora (ou a corretora). */
        int apolicesVigentes,
        boolean ativo
) {
}
