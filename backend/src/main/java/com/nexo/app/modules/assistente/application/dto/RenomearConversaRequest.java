package com.nexo.app.modules.assistente.application.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;

/** Altera o título e/ou fixa a conversa no topo do histórico. Ao menos um dos campos deve vir preenchido. */
public record RenomearConversaRequest(@Size(max = 160) String titulo, Boolean fixada) {

    @AssertTrue(message = "Informe o título ou se a conversa fica fixada")
    public boolean isAlgumaAlteracao() {
        return (titulo != null && !titulo.isBlank()) || fixada != null;
    }
}
