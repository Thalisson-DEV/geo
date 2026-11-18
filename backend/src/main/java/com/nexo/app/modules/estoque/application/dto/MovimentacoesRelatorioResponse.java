package com.nexo.app.modules.estoque.application.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Movimentações de estoque do período e do período anterior de mesma duração, uma linha por movimentação,
 * com estoques, equipe, obra, base e processo já resolvidos. Os relatórios do almoxarifado calculam
 * indicadores, rankings e leituras sobre essas linhas, para que todo número possa ser aberto até a origem.
 */
@Schema(description = "Movimentações para os relatórios do almoxarifado")
public record MovimentacoesRelatorioResponse(
    OffsetDateTime geradoEm,
    LocalDate de,
    LocalDate ate,
    LocalDate anteriorDe,
    LocalDate anteriorAte,
    @Schema(description = "Máximo de linhas por período") int limite,
    @Schema(description = "Verdadeiro quando algum dos períodos tinha mais movimentações que o limite") boolean truncado,
    List<Linha> movimentacoes
) {

    @Schema(description = "Uma movimentação de estoque")
    public record Linha(
        UUID id,
        @Schema(description = "Operação que agrupa as movimentações de um mesmo lançamento") UUID idOperacao,
        OffsetDateTime dataHora,
        @Schema(description = "Verdadeiro quando é do período anterior (comparação)") boolean anterior,
        String tipo,
        String condicao,
        String motivo,
        String observacao,
        BigDecimal quantidade,
        UUID idMaterial,
        String codigo,
        String descricao,
        String unidade,
        String numSerie,
        UUID idOrigem,
        String origem,
        String tipoOrigem,
        UUID idDestino,
        String destino,
        String tipoDestino,
        UUID idBase,
        String base,
        UUID idEquipe,
        String equipe,
        UUID idProcesso,
        String processo,
        UUID idObra,
        String obra,
        UUID idSolicitacao,
        String contexto,
        String tipoTecnico,
        UUID idOperador,
        String operador
    ) {}
}
