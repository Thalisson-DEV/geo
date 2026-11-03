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

import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

/**
 * Uma vez em que o plano foi feito no veículo: informada pelo gestor ou por uma OS
 * preventiva. A da OS guarda o roteiro copiado na abertura, para o plano poder mudar
 * sem reescrever o que a oficina recebeu.
 */
@Entity
@Table(name = "frota_preventiva_realizacoes")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RealizacaoPreventiva extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_controle", nullable = false, updatable = false)
    private ControlePreventivo controle;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem", nullable = false, length = 20, updatable = false)
    private OrigemRealizacaoPreventiva origem;

    @Enumerated(EnumType.STRING)
    @Column(name = "situacao", nullable = false, length = 20)
    private SituacaoRealizacaoPreventiva situacao;

    @Column(name = "id_ordem_servico", updatable = false)
    private UUID idOrdemServico;

    @Column(name = "roteiro", length = 16000, updatable = false)
    private String roteiro;

    @Column(name = "realizada_em")
    private LocalDate realizadaEm;

    @Column(name = "medicao")
    private Long medicao;

    @Enumerated(EnumType.STRING)
    @Column(name = "unidade", nullable = false, length = 10)
    private UnidadeMedicao unidade;

    @Column(name = "observacao", length = 1000)
    private String observacao;

    @Column(name = "id_usuario", updatable = false)
    private UUID idUsuario;

    static RealizacaoPreventiva informada(ControlePreventivo controle, LocalDate data, Long medicao,
                                          UnidadeMedicao unidade, String observacao, UUID idUsuario) {
        var realizacao = new RealizacaoPreventiva();
        realizacao.controle = controle;
        realizacao.origem = OrigemRealizacaoPreventiva.INFORMADA;
        realizacao.situacao = SituacaoRealizacaoPreventiva.CONCLUIDA;
        realizacao.realizadaEm = data;
        realizacao.medicao = medicao;
        realizacao.unidade = unidade;
        realizacao.observacao = Textos.opcional(observacao, 1000);
        realizacao.idUsuario = idUsuario;
        return realizacao;
    }

    /** Aberta junto com a OS preventiva; fecha quando a OS é concluída ou cancelada. */
    public static RealizacaoPreventiva porOrdemServico(ControlePreventivo controle, UUID idOrdemServico,
                                                       UnidadeMedicao unidade, UUID idUsuario) {
        var realizacao = new RealizacaoPreventiva();
        realizacao.controle = Objects.requireNonNull(controle);
        realizacao.origem = OrigemRealizacaoPreventiva.ORDEM_SERVICO;
        realizacao.situacao = SituacaoRealizacaoPreventiva.ABERTA;
        realizacao.idOrdemServico = Objects.requireNonNull(idOrdemServico, "A OS é obrigatória");
        String roteiro = controle.getPlano().roteiroNumerado();
        realizacao.roteiro = roteiro.isBlank() ? null : roteiro;
        realizacao.unidade = Objects.requireNonNull(unidade);
        realizacao.idUsuario = idUsuario;
        return realizacao;
    }

    public void concluir(LocalDate data, Long medicao, UnidadeMedicao unidade) {
        exigirAberta();
        this.realizadaEm = Objects.requireNonNull(data, "A data da realização é obrigatória");
        this.medicao = medicao;
        this.unidade = Objects.requireNonNull(unidade);
        this.situacao = SituacaoRealizacaoPreventiva.CONCLUIDA;
    }

    public void cancelar() {
        exigirAberta();
        this.situacao = SituacaoRealizacaoPreventiva.CANCELADA;
    }

    public boolean isAberta() {
        return situacao == SituacaoRealizacaoPreventiva.ABERTA;
    }

    private void exigirAberta() {
        if (!isAberta()) {
            throw new InvarianteVioladaException("A realização preventiva já foi " + situacao.getRotulo().toLowerCase() + ".");
        }
    }
}
