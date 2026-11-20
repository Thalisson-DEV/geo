package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
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
import java.util.UUID;

/**
 * Quantidade que uma equipe executou de um item programado numa data. É a única origem da quantidade executada
 * do item; criado e estornado pela {@link Programacao}.
 */
@Entity
@Table(name = "apontamentos_execucao")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApontamentoExecucao extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_item_planejado", nullable = false, updatable = false)
    private ItemPlanejado itemPlanejado;

    @Column(name = "id_programacao", nullable = false, updatable = false)
    private UUID idProgramacao;

    @Column(name = "id_obra", nullable = false, updatable = false)
    private UUID idObra;

    @Column(name = "id_equipe", nullable = false, updatable = false)
    private UUID idEquipe;

    @Column(name = "id_turno", updatable = false)
    private UUID idTurno;

    @Column(name = "data", nullable = false, updatable = false)
    private LocalDate data;

    @Column(name = "quantidade", nullable = false, updatable = false, precision = 14, scale = 4)
    private BigDecimal quantidade;

    @Column(name = "excedente", nullable = false, updatable = false, precision = 14, scale = 4)
    private BigDecimal excedente;

    /** Quantidade × valor congelado na programação; nulo para material ou serviço sem valor. */
    @Column(name = "valor_total", updatable = false, precision = 15, scale = 2)
    private BigDecimal valorTotal;

    @Column(name = "justificativa", updatable = false, length = 1000)
    private String justificativa;

    /** Quando veio do app: id do comando no aparelho, hora e GPS. */
    @Embedded
    private RegistroCampo campo;

    /** Ponto em que a equipe marcou o item, quando o app informou. */
    @Column(name = "id_ponto", updatable = false)
    private UUID idPonto;

    /** Veio do "Tudo feito" do ponto, não de quantidade digitada. */
    @Column(name = "ponto_inteiro", nullable = false, updatable = false)
    private boolean pontoInteiro;

    /** Liga o apontamento ao comando do aparelho que o gerou. Só na criação. */
    public void registrarOrigemCampo(RegistroCampo campo, UUID idPonto, boolean pontoInteiro) {
        if (this.campo != null || getId() != null) {
            throw new InvarianteVioladaException("A origem do apontamento já foi registrada.");
        }
        this.campo = java.util.Objects.requireNonNull(campo);
        this.idPonto = idPonto;
        this.pontoInteiro = pontoInteiro;
    }

    ApontamentoExecucao(Programacao programacao, ProgramacaoItem vinculo, UUID idTurno, LocalDate data,
                        BigDecimal quantidade, BigDecimal excedente, String justificativa) {
        String texto = justificativa != null && !justificativa.isBlank() ? justificativa.trim() : null;
        if (excedente.signum() > 0 && texto == null) {
            throw new InvarianteVioladaException("O item " + vinculo.getItemPlanejado().getDescricao()
                    + " passa do previsto: informe a justificativa.");
        }
        this.itemPlanejado = vinculo.getItemPlanejado();
        this.idProgramacao = programacao.getId();
        this.idObra = programacao.getIdObra();
        this.idEquipe = programacao.getIdEquipe();
        this.idTurno = idTurno;
        this.data = data;
        this.quantidade = quantidade;
        this.excedente = excedente;
        this.valorTotal = vinculo.getValorUnitario() != null
                ? vinculo.getValorUnitario().multiply(quantidade).setScale(2, RoundingMode.HALF_UP)
                : null;
        this.justificativa = texto;
    }
}
