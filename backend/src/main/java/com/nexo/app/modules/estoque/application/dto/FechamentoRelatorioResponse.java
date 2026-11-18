package com.nexo.app.modules.estoque.application.dto;

import com.nexo.app.modules.estoque.domain.SituacaoFechamentoObra;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoSolicitacao;
import com.nexo.app.modules.estoque.domain.SituacaoPrazoFechamento;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Solicitações de encerramento de obra para o relatório: as criadas no período e as ainda em andamento de
 * antes dele, com os dois prazos de 48 horas úteis (reserva e movimentação) e quando cada um foi cumprido.
 */
@Schema(description = "Encerramento de obras para os relatórios do almoxarifado")
public record FechamentoRelatorioResponse(
    OffsetDateTime geradoEm,
    LocalDate de,
    LocalDate ate,
    List<Linha> solicitacoes
) {

    @Schema(description = "Uma solicitação de encerramento")
    public record Linha(
        UUID id,
        @Schema(description = "221, 921, 222 ou 922") String tipo,
        UUID idObra,
        String numeroObra,
        String tituloObra,
        String tipoObra,
        SituacaoFechamentoSolicitacao situacao,
        SituacaoFechamentoObra situacaoObra,
        SituacaoPrazoFechamento situacaoPrazo,
        OffsetDateTime prazoVigenteAte,
        OffsetDateTime criadaEm,
        OffsetDateTime prazoReservaAte,
        OffsetDateTime reservaCumpridaEm,
        OffsetDateTime prazoMovimentacaoAte,
        OffsetDateTime movimentacaoConcluidaEm,
        OffsetDateTime canceladaEm,
        String numeroReserva,
        boolean possuiPendencia,
        String motivoPendencia,
        UUID idSolicitante,
        String solicitante,
        UUID idEncarregado,
        String encarregado,
        UUID idSupervisor,
        String supervisor,
        UUID idCoordenador,
        String coordenador,
        UUID idAlmoxarifado,
        String almoxarifado,
        int itens,
        BigDecimal quantidadeSolicitada,
        BigDecimal quantidadeMovimentada,
        @Schema(description = "Criada antes do período e ainda em andamento") boolean anteriorAoPeriodo
    ) {}
}
