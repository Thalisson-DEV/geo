package com.nexo.app.modules.estoque.application.dto;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record MaterialRequest(
    @NotBlank(message = "O código do material é obrigatório")
    String codigo,

    @NotBlank(message = "A descrição é obrigatória")
    String descricao,

    String unidadeMedida,
    String suprMatrFlag,
    UUID idProcesso,
    UUID idAvaliacaoTecnica,
    UUID idCentroInvestimento,
    boolean detalhaSerie,
    /** Nulo mantém as equivalências atuais; lista vazia tira todas. */
    List<Equivalencia> equivalencias
) {
    /** "{@code quantidadeUnidade} {@code unidade} = {@code quantidadeBase} (unidade do material)". */
    public record Equivalencia(String unidade, BigDecimal quantidadeUnidade, BigDecimal quantidadeBase) {
    }
}
