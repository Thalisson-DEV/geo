package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.OrigemOrcamento;
import com.nexo.app.modules.obras.domain.TipoItemKit;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Orçamento da obra comparado com o que foi planejado, executado e medido. Sem orçamento, {@code revisao} é nula e os
 * itens trazem só o que o planejamento prevê (situação fora do orçamento).
 */
public record OrcamentoObraResponse(
        UUID idObra,
        boolean possuiOrcamento,
        Revisao revisao,
        Totais totais,
        Contagens contagens,
        List<Item> itens
) {

    public record Revisao(UUID id, int numero, OrigemOrcamento origem, String observacao, BigDecimal valorServicos,
                          BigDecimal valorMateriais, int quantidadeItens, OffsetDateTime dataCriacao, String usuarioCriacao,
                          OffsetDateTime dataUltimaAlteracao, String usuarioUltimaAlteracao) {
    }

    /**
     * Valores de serviço (mão de obra). {@code saldoServicos} é o orçado que ainda não foi medido;
     * {@code planejadoForaDoOrcamento} é o valor planejado em serviços que o orçamento não tem.
     * {@code planejadoMateriais} vem do preço dos materiais orçados nos kits aplicados.
     */
    public record Totais(BigDecimal orcadoServicos, BigDecimal orcadoMateriais, BigDecimal planejadoServicos,
                         BigDecimal executadoServicos, BigDecimal medidoServicos, BigDecimal saldoServicos,
                         BigDecimal planejadoForaDoOrcamento, BigDecimal planejadoMateriais) {
    }

    public record Contagens(int acima, int foraDoOrcamento, int naoPlanejados, int semReferencia) {
    }

    /**
     * Uma linha por código, tipo e operação. {@code id} é o item do orçamento (nulo quando está fora dele).
     * Quantidades nulas quando a fonte não tem o item. {@code excedente} é quanto o maior entre planejado, executado e
     * medido passou do orçado. {@code semReferencia}: o código não bate com Ação do contrato nem material do catálogo.
     */
    public record Item(UUID id, TipoItemKit tipo, OperacaoItemKit operacao, String codigo, String descricao, String unidade,
                       UUID idAcao, UUID idMaterial,
                       BigDecimal orcadoQuantidade, BigDecimal valorUnitario, BigDecimal orcadoValor,
                       BigDecimal planejadoQuantidade, BigDecimal planejadoValor,
                       BigDecimal executadoQuantidade, BigDecimal executadoValor,
                       BigDecimal medidoQuantidade, BigDecimal medidoValor,
                       SituacaoItemOrcamento situacao, BigDecimal excedente, boolean semReferencia) {
    }

    public enum SituacaoItemOrcamento {
        /** Planejado, executado e medido dentro do orçado. */
        DENTRO,
        /** Planejado, executado ou medido passou do orçado. */
        ACIMA,
        /** Está no planejamento, na execução ou na medição, mas não no orçamento. */
        FORA_DO_ORCAMENTO,
        /** Orçado e ainda sem kit no planejamento. */
        NAO_PLANEJADO,
        /** A obra não tem orçamento, ou o orçamento não traz itens deste tipo (ex.: só serviços): nada a comparar. */
        SEM_ORCADO
    }
}
