package com.nexo.app.modules.estoque.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Posição atual do estoque: saldos positivos por estoque, material e condição, com as séries, a última
 * entrada e a última saída. Cobertura, material parado e ruptura são calculados no cliente cruzando com o
 * consumo das movimentações.
 */
@Schema(description = "Posição de estoque para os relatórios do almoxarifado")
public record EstoqueRelatorioResponse(
    OffsetDateTime geradoEm,
    @Schema(description = "Máximo de saldos devolvidos") int limite,
    @Schema(description = "Verdadeiro quando havia mais saldos que o limite") boolean truncado,
    List<Saldo> saldos
) {

    @Schema(description = "Saldo positivo de um material num estoque")
    public record Saldo(
        UUID idEstoque,
        String estoque,
        @Schema(description = "FISICO, CAMPO ou OBRA") String tipoEstoque,
        UUID idBase,
        String base,
        UUID idEquipe,
        String equipe,
        UUID idProcesso,
        String processo,
        UUID idObra,
        String obra,
        UUID idMaterial,
        String codigo,
        String descricao,
        String unidade,
        boolean detalhaSerie,
        String condicao,
        BigDecimal quantidade,
        int series,
        int seriesReservadas,
        OffsetDateTime ultimaEntrada,
        OffsetDateTime ultimaSaida,
        @Schema(description = "Quando o saldo foi aberto neste estoque") OffsetDateTime desde
    ) {}
}
