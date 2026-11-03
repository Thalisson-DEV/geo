package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

/**
 * Parcela da apólice, paga por uma solicitação de pagamento do financeiro (origem
 * {@code FROTA_SEGURO}). Com o pagamento pedido ou aprovado, vencimento e valor ficam travados.
 */
@Entity
@Table(name = "frota_apolice_parcelas")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ParcelaApolice extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_apolice", nullable = false, updatable = false)
    private Apolice apolice;

    @Column(name = "numero", nullable = false)
    private Integer numero;

    @Column(name = "vencimento", nullable = false)
    private LocalDate vencimento;

    @Column(name = "valor", nullable = false, precision = 14, scale = 2)
    private BigDecimal valor;

    @Column(name = "id_solicitacao_financeira")
    private UUID idSolicitacaoFinanceira;

    @Column(name = "numero_solicitacao_financeira")
    private Long numeroSolicitacaoFinanceira;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao_pagamento", length = 20)
    private SituacaoPagamentoDespesa situacaoPagamento;

    @Column(name = "motivo_reprovacao_pagamento", length = 500)
    private String motivoReprovacaoPagamento;

    ParcelaApolice(Apolice apolice, int numero, LocalDate vencimento, BigDecimal valor) {
        this.apolice = apolice;
        this.numero = numero;
        preencher(vencimento, valor);
    }

    void alterar(LocalDate novoVencimento, BigDecimal novoValor) {
        if (pagamentoEmAndamento()) {
            throw new InvarianteVioladaException("A parcela " + numero + " tem pagamento " + situacaoCurta()
                    + " no financeiro: vencimento e valor não mudam.");
        }
        preencher(novoVencimento, novoValor);
    }

    void remover() {
        if (pagamentoEmAndamento()) {
            throw new InvarianteVioladaException("A parcela " + numero + " tem pagamento " + situacaoCurta()
                    + " no financeiro e não pode sair.");
        }
        desativar();
    }

    /** Ainda sem pagamento vivo no financeiro (nunca pedido, ou reprovado). */
    public boolean podePedirPagamento() {
        return isAtivo() && apolice.isAtivo()
                && (situacaoPagamento == null || situacaoPagamento == SituacaoPagamentoDespesa.REPROVADO);
    }

    public void exigirPodePedirPagamento() {
        if (podePedirPagamento()) {
            return;
        }
        if (!isAtivo() || !apolice.isAtivo()) {
            throw new InvarianteVioladaException("Esta parcela foi excluída.");
        }
        throw new InvarianteVioladaException("A parcela " + numero + " já tem pagamento " + situacaoCurta() + " no financeiro.");
    }

    /** O financeiro criou a solicitação pedida pela parcela. */
    public void vincularSolicitacao(UUID idSolicitacao) {
        exigirPodePedirPagamento();
        this.idSolicitacaoFinanceira = Objects.requireNonNull(idSolicitacao);
        this.numeroSolicitacaoFinanceira = null;
        this.situacaoPagamento = SituacaoPagamentoDespesa.SOLICITADO;
        this.motivoReprovacaoPagamento = null;
    }

    public void registrarDecisao(Long numeroSolicitacao, boolean aprovada, String motivo) {
        this.numeroSolicitacaoFinanceira = numeroSolicitacao;
        this.situacaoPagamento = aprovada ? SituacaoPagamentoDespesa.APROVADO : SituacaoPagamentoDespesa.REPROVADO;
        this.motivoReprovacaoPagamento = aprovada ? null : Textos.opcional(motivo, 500);
    }

    public boolean pagamentoEmAndamento() {
        return situacaoPagamento == SituacaoPagamentoDespesa.SOLICITADO || situacaoPagamento == SituacaoPagamentoDespesa.APROVADO;
    }

    private String situacaoCurta() {
        return situacaoPagamento == SituacaoPagamentoDespesa.APROVADO ? "aprovado" : "solicitado";
    }

    private void preencher(LocalDate novoVencimento, BigDecimal novoValor) {
        if (novoVencimento == null) {
            throw new InvarianteVioladaException("Informe o vencimento da parcela.");
        }
        if (novoValor == null || novoValor.signum() <= 0) {
            throw new InvarianteVioladaException("Informe o valor da parcela.");
        }
        this.vencimento = novoVencimento;
        this.valor = novoValor.setScale(2, RoundingMode.HALF_UP);
    }
}
