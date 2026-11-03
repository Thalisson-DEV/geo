package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
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
 * Despesa lançada por veículo: lavagem, estacionamento, pedágio, mensalidade, taxa ou outra.
 *
 * <p>A pagar vai ao financeiro como solicitação de pagamento; cartão, reembolso ou já pago é só
 * registro. Enquanto o pagamento está pedido ou aprovado, valor, fornecedor, documento e forma de
 * pagamento ficam travados, para a despesa não divergir do que o financeiro paga.</p>
 */
@Entity
@Table(name = "frota_despesas")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DespesaVeiculo extends BaseEntity {

    @Column(name = "id_veiculo", nullable = false)
    private UUID idVeiculo;

    @Column(name = "data", nullable = false)
    private LocalDate data;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_tipo", nullable = false)
    private TipoDespesa tipo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_subtipo")
    private SubtipoDespesa subtipo;

    @Column(name = "descricao", length = 500)
    private String descricao;

    @Column(name = "valor", nullable = false, precision = 14, scale = 2)
    private BigDecimal valor;

    @Column(name = "id_base_operacional")
    private UUID idBaseOperacional;

    /** Setor/centro de custo do financeiro (processo de negócio). */
    @Column(name = "id_processo")
    private UUID idProcesso;

    @Column(name = "id_fornecedor")
    private UUID idFornecedor;

    @Column(name = "fornecedor_nome", length = 150)
    private String fornecedorNome;

    @Enumerated(EnumType.STRING)
    @Column(name = "documento_tipo", length = 10)
    private TipoDocumentoFiscal documentoTipo;

    @Column(name = "documento_numero", length = 60)
    private String documentoNumero;

    @Column(name = "medicao", precision = 12, scale = 1)
    private BigDecimal medicao;

    @Enumerated(EnumType.STRING)
    @Column(name = "forma_pagamento", nullable = false, length = 20)
    private FormaPagamentoDespesa formaPagamento;

    @Column(name = "id_solicitacao_financeira")
    private UUID idSolicitacaoFinanceira;

    @Column(name = "numero_solicitacao_financeira")
    private Long numeroSolicitacaoFinanceira;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao_pagamento", length = 20)
    private SituacaoPagamentoDespesa situacaoPagamento;

    @Column(name = "motivo_reprovacao_pagamento", length = 500)
    private String motivoReprovacaoPagamento;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem", nullable = false, length = 20, updatable = false)
    private OrigemDespesa origem;

    @Embedded
    private ReferenciaExterna referenciaExterna;

    public record Dados(UUID idVeiculo, LocalDate data, TipoDespesa tipo, SubtipoDespesa subtipo, String descricao, BigDecimal valor,
                        UUID idBaseOperacional, UUID idProcesso, UUID idFornecedor, String fornecedorNome,
                        TipoDocumentoFiscal documentoTipo, String documentoNumero, BigDecimal medicao,
                        FormaPagamentoDespesa formaPagamento) {
    }

    public static DespesaVeiculo registrar(Dados dados, LocalDate hoje) {
        var despesa = new DespesaVeiculo();
        despesa.origem = OrigemDespesa.MANUAL;
        despesa.preencher(dados, hoje);
        return despesa;
    }

    /** Importada por planilha: guarda a chave do sistema de origem para a reimportação não duplicar. */
    public static DespesaVeiculo importar(Dados dados, ReferenciaExterna referencia, LocalDate hoje) {
        var despesa = new DespesaVeiculo();
        despesa.origem = OrigemDespesa.IMPORTACAO;
        despesa.referenciaExterna = referencia;
        despesa.preencher(dados, hoje);
        return despesa;
    }

    public void atualizar(Dados dados, LocalDate hoje) {
        exigirAtiva();
        if (pagamentoEmAndamento() && mudaOQueOFinanceiroPaga(dados)) {
            throw new InvarianteVioladaException("O pagamento desta despesa está " + situacaoCurta()
                    + " no financeiro: valor, fornecedor, documento e forma de pagamento não mudam.");
        }
        preencher(dados, hoje);
    }

    /** Exclusão lógica; não vale com pagamento pedido ou aprovado no financeiro. */
    public void excluir() {
        exigirAtiva();
        if (pagamentoEmAndamento()) {
            throw new InvarianteVioladaException("Esta despesa tem pagamento " + situacaoCurta() + " no financeiro e não pode ser excluída.");
        }
        desativar();
    }

    /** A pagar e sem pagamento vivo no financeiro (nunca pedido, ou reprovado). */
    public boolean podePedirPagamento() {
        return isAtivo() && formaPagamento == FormaPagamentoDespesa.A_PAGAR
                && (situacaoPagamento == null || situacaoPagamento == SituacaoPagamentoDespesa.REPROVADO);
    }

    public void exigirPodePedirPagamento() {
        if (podePedirPagamento()) {
            return;
        }
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Esta despesa foi excluída.");
        }
        throw new InvarianteVioladaException(formaPagamento != FormaPagamentoDespesa.A_PAGAR
                ? "Esta despesa foi paga por " + formaPagamento.getRotulo().toLowerCase() + " e não vai ao financeiro."
                : "Esta despesa já tem pagamento " + situacaoCurta() + " no financeiro.");
    }

    /** O financeiro criou a solicitação pedida pela despesa. */
    public void vincularSolicitacao(UUID idSolicitacao) {
        exigirPodePedirPagamento();
        this.idSolicitacaoFinanceira = Objects.requireNonNull(idSolicitacao);
        this.numeroSolicitacaoFinanceira = null;
        this.situacaoPagamento = SituacaoPagamentoDespesa.SOLICITADO;
        this.motivoReprovacaoPagamento = null;
    }

    /** Aprovação ou reprovação da solicitação vinculada. */
    public void registrarDecisao(Long numero, boolean aprovada, String motivo) {
        this.numeroSolicitacaoFinanceira = numero;
        this.situacaoPagamento = aprovada ? SituacaoPagamentoDespesa.APROVADO : SituacaoPagamentoDespesa.REPROVADO;
        this.motivoReprovacaoPagamento = aprovada ? null : Textos.opcional(motivo, 500);
    }

    /** "Lavagem completa", "Pedágio". */
    public String descricaoTipo() {
        return tipo.getNome() + (subtipo == null ? "" : " " + subtipo.getNome().toLowerCase());
    }

    private boolean pagamentoEmAndamento() {
        return situacaoPagamento == SituacaoPagamentoDespesa.SOLICITADO || situacaoPagamento == SituacaoPagamentoDespesa.APROVADO;
    }

    private String situacaoCurta() {
        return situacaoPagamento == SituacaoPagamentoDespesa.APROVADO ? "aprovado" : "solicitado";
    }

    private boolean mudaOQueOFinanceiroPaga(Dados d) {
        var forma = d.formaPagamento() == null ? FormaPagamentoDespesa.A_PAGAR : d.formaPagamento();
        return d.valor() == null || valor.compareTo(d.valor().setScale(2, RoundingMode.HALF_UP)) != 0
                || !Objects.equals(idFornecedor, d.idFornecedor())
                || (d.idFornecedor() == null && !Objects.equals(fornecedorNome, Textos.opcional(d.fornecedorNome(), 150)))
                || documentoTipo != d.documentoTipo()
                || !Objects.equals(documentoNumero, Textos.opcional(d.documentoNumero(), 60))
                || formaPagamento != forma;
    }

    private void exigirAtiva() {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("Esta despesa foi excluída.");
        }
    }

    private void preencher(Dados d, LocalDate hoje) {
        if (d.idVeiculo() == null) {
            throw new InvarianteVioladaException("Informe o veículo da despesa.");
        }
        if (d.data() == null) {
            throw new InvarianteVioladaException("Informe a data da despesa.");
        }
        if (d.data().isAfter(hoje)) {
            throw new InvarianteVioladaException("A data da despesa não pode ser no futuro.");
        }
        if (d.tipo() == null || !d.tipo().isAtivo()) {
            throw new InvarianteVioladaException("Escolha um tipo de despesa ativo.");
        }
        if (d.subtipo() != null && (!d.subtipo().getTipo().getId().equals(d.tipo().getId()) || !d.subtipo().isAtivo())) {
            throw new InvarianteVioladaException("O subtipo escolhido não é de " + d.tipo().getNome().toLowerCase() + ".");
        }
        if (d.valor() == null || d.valor().signum() <= 0) {
            throw new InvarianteVioladaException("Informe o valor da despesa.");
        }
        if (d.medicao() != null && d.medicao().signum() < 0) {
            throw new InvarianteVioladaException("A medição não pode ser negativa.");
        }
        String numero = Textos.opcional(d.documentoNumero(), 60);
        if ((d.documentoTipo() == null) != (numero == null)) {
            throw new InvarianteVioladaException("Informe o tipo e o número do documento juntos.");
        }
        this.idVeiculo = d.idVeiculo();
        this.data = d.data();
        this.tipo = d.tipo();
        this.subtipo = d.subtipo();
        this.descricao = Textos.opcional(d.descricao(), 500);
        this.valor = d.valor().setScale(2, RoundingMode.HALF_UP);
        this.idBaseOperacional = d.idBaseOperacional();
        this.idProcesso = d.idProcesso();
        this.idFornecedor = d.idFornecedor();
        this.fornecedorNome = d.idFornecedor() != null ? null : Textos.opcional(d.fornecedorNome(), 150);
        this.documentoTipo = d.documentoTipo();
        this.documentoNumero = numero;
        this.medicao = d.medicao();
        this.formaPagamento = d.formaPagamento() == null ? FormaPagamentoDespesa.A_PAGAR : d.formaPagamento();
    }
}
