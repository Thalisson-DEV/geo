package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.AptidaoConducao;

import java.time.LocalDate;
import java.util.UUID;

/** Situação da CNH do condutor para o veículo no dia e a liberação do gestor, se houver. */
public record AptidaoConducaoResponse(
        AptidaoConducao.SituacaoCnh situacao,
        String mensagem,
        LocalDate validade,
        String categoriaExigida,
        String categoriaAtual,
        UUID idLiberacao
) {
}
