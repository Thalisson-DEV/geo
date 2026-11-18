package com.nexo.app.modules.estoque.application.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Materiais seriados do estoque da equipe com mais séries do que saldo, com as séries que a
 * equipe aplicou sem que elas tivessem entrado no caminhão. Lista vazia: nada a conferir.
 */
public record SeriesAConferirResponse(UUID idEstoque, List<MaterialAConferir> materiais) {

    public record MaterialAConferir(
            UUID idMaterial,
            String codigo,
            String descricao,
            BigDecimal quantidadeSaldo,
            int seriesNoSaldo,
            /** Séries a mais no caminhão: quantas ainda podem sair por conciliação. */
            int seriesSobrando,
            List<AplicacaoForaDoSaldo> aplicadas,
            List<String> seriesDisponiveis
    ) {
    }

    public record AplicacaoForaDoSaldo(
            UUID idMovimentacao,
            String numSerie,
            OffsetDateTime dataHora,
            /** Série do caminhão parecida com a aplicada (provável erro de digitação), se houver. */
            String sugestao
    ) {
    }
}
