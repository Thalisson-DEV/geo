package com.nexo.app.modules.obras.application.dto;

import jakarta.validation.constraints.Size;

/** Observação da revisão gerada pelo planejamento (ex.: "Revisão de projeto"). */
public record GerarOrcamentoObraRequest(@Size(max = 500, message = "A observação tem até 500 caracteres.") String observacao) {
}
