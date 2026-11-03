package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Um fato na vida do pneu (somente inserção): cadastro, montagem, rodízio, desmontagem, reparo,
 * reforma, descarte ou inspeção. Os eventos de uma mesma movimentação compartilham o lote.
 */
@Entity
@Table(name = "frota_pneu_eventos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EventoPneu extends BaseEntity {

    @Column(name = "id_pneu", nullable = false, updatable = false)
    private UUID idPneu;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 30, updatable = false)
    private TipoEventoPneu tipo;

    @Column(name = "ocorrido_em", nullable = false, updatable = false)
    private OffsetDateTime ocorridoEm;

    @Column(name = "id_veiculo", updatable = false)
    private UUID idVeiculo;

    @Column(name = "placa", length = 10, updatable = false)
    private String placa;

    @Column(name = "posicao_origem", length = 5, updatable = false)
    private String posicaoOrigem;

    @Column(name = "posicao_destino", length = 5, updatable = false)
    private String posicaoDestino;

    /** km acumulado do veículo no evento. */
    @Column(name = "km_veiculo", updatable = false)
    private Integer kmVeiculo;

    /** km que o pneu rodou desde a montagem (desmontagem e rodízio). */
    @Column(name = "km_rodado", updatable = false)
    private Integer kmRodado;

    @Column(name = "vida", nullable = false, updatable = false)
    private int vida;

    @Column(name = "sulco_mm", precision = 4, scale = 1, updatable = false)
    private BigDecimal sulcoMm;

    @Column(name = "pressao_psi", updatable = false)
    private Integer pressaoPsi;

    @Column(name = "valor", precision = 14, scale = 2, updatable = false)
    private BigDecimal valor;

    @Column(name = "id_fornecedor", updatable = false)
    private UUID idFornecedor;

    @Column(name = "documento", length = 60, updatable = false)
    private String documento;

    @Column(name = "id_inspecao", updatable = false)
    private UUID idInspecao;

    @Column(name = "id_lote", updatable = false)
    private UUID idLote;

    @Column(name = "descricao", nullable = false, length = 500, updatable = false)
    private String descricao;

    @Column(name = "observacao", length = 1000, updatable = false)
    private String observacao;

    /** Começa o evento com o estado do pneu (vida e sulco); os detalhes vêm pelos métodos {@code com*}. */
    public static EventoPneu de(Pneu pneu, TipoEventoPneu tipo, OffsetDateTime quando, String descricao) {
        var evento = new EventoPneu();
        evento.idPneu = pneu.getId();
        evento.tipo = tipo;
        evento.ocorridoEm = quando;
        evento.vida = pneu.getVida();
        evento.sulcoMm = pneu.getSulcoAtualMm();
        evento.descricao = Textos.obrigatorio(descricao, "descrição", 500);
        return evento;
    }

    public EventoPneu comVeiculo(UUID idVeiculo, String placa, String origem, String destino, Long km) {
        this.idVeiculo = idVeiculo;
        this.placa = placa;
        this.posicaoOrigem = origem;
        this.posicaoDestino = destino;
        this.kmVeiculo = km == null ? null : km.intValue();
        return this;
    }

    public EventoPneu comKmRodado(Integer kmRodado) {
        this.kmRodado = kmRodado;
        return this;
    }

    public EventoPneu comCusto(BigDecimal valor, UUID idFornecedor, String documento) {
        this.valor = valor;
        this.idFornecedor = idFornecedor;
        this.documento = Textos.opcional(documento, 60);
        return this;
    }

    public EventoPneu comMedicao(BigDecimal sulco, Integer pressao, UUID idInspecao) {
        if (sulco != null) {
            this.sulcoMm = sulco;
        }
        this.pressaoPsi = pressao;
        this.idInspecao = idInspecao;
        return this;
    }

    public EventoPneu noLote(UUID idLote, String observacao) {
        this.idLote = idLote;
        this.observacao = Textos.opcional(observacao, 1000);
        return this;
    }
}
