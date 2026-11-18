package com.nexo.app.modules.estoque.application.dto;

import com.nexo.app.modules.estoque.domain.EfeitoEstoque;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoObra;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoSolicitacao;
import com.nexo.app.modules.estoque.domain.SituacaoPrazoFechamento;
import com.nexo.app.modules.estoque.domain.TipoOperacaoSolicitacao;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Respostas do encerramento de obra. */
public final class FechamentoObraResponses {

    private FechamentoObraResponses() {
    }

    public record Importacao(
            List<FechamentoImportacaoDTO> registros,
            int totalProcessados,
            int totalSucesso,
            int totalFalha,
            @Schema(description = "Previstas na validação; criadas na confirmação") int totalSolicitacoes,
            ProcessamentoImportacao processamento
    ) {
    }

    public record Pessoa(UUID id, String nome) {
    }

    public record Obra(UUID id, String numero, String titulo) {
    }

    public record Estoque(UUID id, String nome) {
    }

    public record Prazo(OffsetDateTime limite, SituacaoPrazoFechamento situacao) {
    }

    public record Pendencia(UUID idMotivo, String motivo, String justificativa) {
    }

    public record Resumo(
            UUID id,
            Long versao,
            String tipo,
            Obra obra,
            SituacaoFechamentoSolicitacao situacao,
            SituacaoFechamentoObra situacaoObra,
            Prazo prazoVigente,
            boolean possuiPendencia,
            String numeroReserva,
            Pessoa solicitante,
            Pessoa encarregado,
            Pessoa supervisor,
            Pessoa coordenador,
            int totalItens,
            BigDecimal quantidadeSolicitada,
            BigDecimal quantidadeMovimentada,
            OffsetDateTime criadaEm,
            Estoque almoxarifadoAtendimento,
            OffsetDateTime movimentacaoConcluidaEm,
            Acoes acoes
    ) {
    }

    public record Item(
            UUID id,
            UUID idMaterial,
            String codigoMaterial,
            String descricaoMaterial,
            String unidade,
            BigDecimal quantidade,
            BigDecimal quantidadeMovimentada,
            BigDecimal quantidadePendente,
            Pendencia pendencia,
            boolean removivel,
            @Schema(description = "Outras unidades em que a quantidade pode ser informada")
            java.util.List<com.nexo.app.modules.estoque.UnidadeEquivalenteResponse> equivalencias
    ) {
    }

    public record ItemMovimentacao(
            UUID id,
            UUID idItemSolicitacao,
            String codigoMaterial,
            String descricaoMaterial,
            BigDecimal quantidade,
            BigDecimal quantidadeEstornavel
    ) {
    }

    public record Movimentacao(
            UUID id,
            TipoOperacaoSolicitacao tipo,
            EfeitoEstoque efeitoEstoque,
            UUID idMovimentacaoOriginal,
            OffsetDateTime realizadaEm,
            Pessoa operador,
            String motivo,
            List<ItemMovimentacao> itens,
            boolean podeEstornar
    ) {
    }

    public record Reserva(String numero, LocalDate dataCriacao, OffsetDateTime registradaEm) {
    }

    public record Acoes(
            boolean editar,
            boolean registrarReserva,
            boolean alterarReserva,
            boolean pendencias,
            boolean cancelar,
            boolean movimentar
    ) {
    }

    public record Detalhe(
            UUID id,
            Long versao,
            String tipo,
            Obra obra,
            Estoque almoxarifadoAtendimento,
            Estoque estoqueObra,
            SituacaoFechamentoSolicitacao situacao,
            SituacaoFechamentoObra situacaoObra,
            Prazo prazoReserva,
            Prazo prazoMovimentacao,
            Prazo prazoVigente,
            Reserva reserva,
            Pessoa solicitante,
            Pessoa encarregado,
            Pessoa supervisor,
            Pessoa coordenador,
            String observacao,
            Pendencia pendenciaGeral,
            boolean possuiPendencia,
            OffsetDateTime criadaEm,
            OffsetDateTime movimentacaoConcluidaEm,
            OffsetDateTime canceladaEm,
            String motivoCancelamento,
            List<Item> itens,
            List<Movimentacao> movimentacoes,
            Acoes acoes
    ) {
    }

    public record Criacao(List<UUID> ids) {
    }

    public record LinhaPrevia(
            UUID idMaterial,
            String codigoMaterial,
            String descricaoMaterial,
            Estoque estoque,
            BigDecimal saldoAtual,
            BigDecimal variacao,
            BigDecimal saldoResultante
    ) {
    }

    public record Previa(boolean deixaSaldoNegativo, List<LinhaPrevia> linhas) {
    }

    public record SituacaoObra(
            UUID idObra,
            SituacaoFechamentoObra situacao,
            long total,
            long movimentadas,
            long emAndamento,
            long canceladas
    ) {
    }
}
