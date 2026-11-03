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
 * Acompanhamento de um plano preventivo num veículo: a base do ciclo atual (de onde a
 * próxima realização é contada), a realização em execução e a memória dos avisos do ciclo.
 *
 * <p>A medição da base é a acumulada do livro-razão, que soma os painéis anteriores da
 * mesma unidade: uma troca de painel não perde o que o veículo já rodou.</p>
 */
@Entity
@Table(name = "frota_preventiva_controles")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ControlePreventivo extends BaseEntity {

    @Column(name = "id_veiculo", nullable = false, updatable = false)
    private UUID idVeiculo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_plano", nullable = false, updatable = false)
    private PlanoPreventivo plano;

    @Column(name = "base_data", nullable = false)
    private LocalDate baseData;

    @Column(name = "base_medicao")
    private Long baseMedicao;

    @Enumerated(EnumType.STRING)
    @Column(name = "base_unidade", nullable = false, length = 10)
    private UnidadeMedicao baseUnidade;

    @Enumerated(EnumType.STRING)
    @Column(name = "base_origem", nullable = false, length = 20)
    private OrigemBasePreventiva baseOrigem;

    @Column(name = "id_realizacao_aberta")
    private UUID idRealizacaoAberta;

    @Column(name = "avisado_proxima_em")
    private LocalDate avisadoProximaEm;

    @Column(name = "avisado_vencida_em")
    private LocalDate avisadoVencidaEm;

    public static ControlePreventivo iniciar(UUID idVeiculo, PlanoPreventivo plano, LocalDate data, Long medicao,
                                             UnidadeMedicao unidade, OrigemBasePreventiva origem) {
        var controle = new ControlePreventivo();
        controle.idVeiculo = Objects.requireNonNull(idVeiculo, "O veículo é obrigatório");
        controle.plano = Objects.requireNonNull(plano, "O plano é obrigatório");
        controle.definirBase(data, medicao, unidade, origem);
        return controle;
    }

    /** Começa um novo ciclo; os avisos do ciclo anterior deixam de valer. */
    public void definirBase(LocalDate data, Long medicao, UnidadeMedicao unidade, OrigemBasePreventiva origem) {
        this.baseData = Objects.requireNonNull(data, "A data da base é obrigatória");
        if (medicao != null && medicao < 0) {
            throw new InvarianteVioladaException("A medição não pode ser negativa.");
        }
        this.baseMedicao = medicao;
        this.baseUnidade = Objects.requireNonNull(unidade, "A unidade é obrigatória");
        this.baseOrigem = Objects.requireNonNull(origem, "A origem da base é obrigatória");
        this.avisadoProximaEm = null;
        this.avisadoVencidaEm = null;
    }

    /**
     * O controle nasceu antes da primeira leitura do veículo: a primeira medição vira a base,
     * sem mudar a data (o ciclo por tempo já estava contando).
     */
    public boolean completarMedicaoInicial(Long medicao, UnidadeMedicao unidade) {
        if (baseMedicao != null || medicao == null || baseOrigem != OrigemBasePreventiva.INICIO || unidade != baseUnidade) {
            return false;
        }
        this.baseMedicao = medicao;
        return true;
    }

    /**
     * Realização feita fora do sistema. Vira a base mesmo sendo anterior à atual: é o gestor
     * corrigindo o que o sistema não sabia.
     */
    public RealizacaoPreventiva informarRealizacao(LocalDate data, Long medicao, Long medicaoAtual,
                                                   UnidadeMedicao unidadeAtual, String observacao,
                                                   LocalDate hoje, UUID idUsuario) {
        exigirAtivo();
        if (data == null) {
            throw new InvarianteVioladaException("Informe a data da realização.");
        }
        if (data.isAfter(hoje)) {
            throw new InvarianteVioladaException("A data da realização não pode estar no futuro.");
        }
        if (medicao != null && medicao < 0) {
            throw new InvarianteVioladaException("A medição não pode ser negativa.");
        }
        if (medicao != null && medicaoAtual != null && medicao > medicaoAtual) {
            throw new InvarianteVioladaException("A medição informada passa a atual do veículo ("
                    + Medidas.formatar(medicaoAtual, unidadeAtual) + ").");
        }
        if (medicao == null && plano.intervalo(unidadeAtual) != null) {
            throw new InvarianteVioladaException("Informe " + (unidadeAtual == UnidadeMedicao.HORAS
                    ? "o horímetro" : "o KM") + " da realização.");
        }
        definirBase(data, medicao, unidadeAtual, OrigemBasePreventiva.INFORMADA);
        return RealizacaoPreventiva.informada(this, data, medicao, unidadeAtual, observacao, idUsuario);
    }

    public void vincularRealizacao(RealizacaoPreventiva realizacao) {
        exigirAtivo();
        if (idRealizacaoAberta != null) {
            throw new InvarianteVioladaException("O plano " + plano.getNome() + " já tem uma OS aberta neste veículo.");
        }
        this.idRealizacaoAberta = Objects.requireNonNull(realizacao.getId(), "Salve a realização antes de vincular");
    }

    /** A OS foi concluída: a realização vira a base do próximo ciclo. */
    public void concluirRealizacao(RealizacaoPreventiva realizacao) {
        if (realizacao.getId().equals(idRealizacaoAberta)) {
            this.idRealizacaoAberta = null;
        }
        definirBase(realizacao.getRealizadaEm(), realizacao.getMedicao(), realizacao.getUnidade(),
                OrigemBasePreventiva.ORDEM_SERVICO);
    }

    /** A OS foi cancelada: volta a esperar uma OS, com a mesma base. */
    public void liberarRealizacao(RealizacaoPreventiva realizacao) {
        if (realizacao.getId().equals(idRealizacaoAberta)) {
            this.idRealizacaoAberta = null;
        }
    }

    public boolean temRealizacaoAberta() {
        return idRealizacaoAberta != null;
    }

    public boolean isSemHistorico() {
        return baseOrigem == OrigemBasePreventiva.INICIO;
    }

    /** Se a etapa ainda não foi avisada neste ciclo. Vencida avisada cobre a próxima. */
    public boolean precisaAvisar(SituacaoPreventiva situacao) {
        return switch (situacao) {
            case VENCIDA -> avisadoVencidaEm == null;
            case PROXIMA -> avisadoProximaEm == null && avisadoVencidaEm == null;
            case EM_DIA -> false;
        };
    }

    public void registrarAviso(SituacaoPreventiva situacao, LocalDate hoje) {
        if (situacao == SituacaoPreventiva.VENCIDA) {
            this.avisadoVencidaEm = hoje;
        } else if (situacao == SituacaoPreventiva.PROXIMA) {
            this.avisadoProximaEm = hoje;
        }
    }

    private void exigirAtivo() {
        if (!isAtivo()) {
            throw new InvarianteVioladaException("O plano " + plano.getNome() + " não acompanha mais este veículo.");
        }
    }
}
