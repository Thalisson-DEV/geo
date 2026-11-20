package com.nexo.app.modules.assistente.application.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Avaliação de uma resposta da Bússola. {@code avaliacao} nula remove a avaliação anterior.
 *
 * @param avaliacao  POSITIVA ou NEGATIVA
 * @param motivo     motivo escolhido na lista (só na negativa)
 * @param comentario texto livre opcional
 */
public record AvaliarRespostaRequest(
        @Pattern(regexp = "POSITIVA|NEGATIVA", message = "Avaliação deve ser POSITIVA ou NEGATIVA") String avaliacao,
        @Size(max = 60) String motivo,
        @Size(max = 1000) String comentario) {
}
