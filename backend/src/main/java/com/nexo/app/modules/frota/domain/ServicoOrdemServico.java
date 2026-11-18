package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Mão de obra lançada na OS. O mecânico é um colaborador (oficina interna) ou um nome
 * livre (oficina externa); a coerência com a oficina é garantida pela {@link OrdemServico}.
 */
@Entity
@Table(name = "frota_os_servicos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ServicoOrdemServico extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_ordem_servico", nullable = false, updatable = false)
    private OrdemServico ordem;

    @Column(name = "descricao", nullable = false, length = 300)
    private String descricao;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_item_manutencao")
    private ItemManutencao item;

    @Column(name = "id_mecanico")
    private UUID idMecanico;

    @Column(name = "mecanico_nome", length = 120)
    private String mecanicoNome;

    @Column(name = "quantidade", nullable = false, precision = 12, scale = 3)
    private BigDecimal quantidade;

    @Column(name = "valor_unitario", nullable = false, precision = 14, scale = 4)
    private BigDecimal valorUnitario;

    @Column(name = "subtotal", nullable = false, precision = 14, scale = 2)
    private BigDecimal subtotal;

    /** Valor zero de propósito (garantia, cortesia): não deixa a OS com valores pendentes. */
    @Column(name = "sem_custo", nullable = false)
    private boolean semCusto;

    ServicoOrdemServico(OrdemServico ordem) {
        this.ordem = ordem;
    }

    void preencher(OrdemServico.DadosServico dados) {
        this.descricao = Textos.obrigatorio(dados.descricao(), "nome do serviço", 300);
        this.item = dados.item();
        definirMecanico(dados.idMecanico(), dados.mecanicoNome());
        this.quantidade = LancamentoOrdemServico.quantidade(dados.quantidade());
        this.valorUnitario = LancamentoOrdemServico.valorUnitario(dados.valorUnitario());
        this.subtotal = LancamentoOrdemServico.subtotal(quantidade, valorUnitario);
        if (subtotal.signum() > 0) this.semCusto = false;
    }

    /** "Sem custo" só vale para o lançamento de valor zero. */
    void definirSemCusto(boolean semCusto) {
        this.semCusto = semCusto && subtotal.signum() == 0;
    }

    /** Valor zero sem a marca de "sem custo": falta lançar o valor. */
    boolean isSemValor() {
        return subtotal.signum() == 0 && !semCusto;
    }

    void definirMecanico(UUID idMecanico, String nome) {
        this.idMecanico = idMecanico;
        this.mecanicoNome = idMecanico == null ? Textos.opcional(nome, 120) : null;
    }

    public boolean temMecanicoColaborador() {
        return idMecanico != null;
    }
}
