package com.nexo.app.modules.frota.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Período em que um colaborador foi o condutor responsável por um veículo.
 *
 * <p>É o que responde "quem dirigia a placa X no dia D" para multas, infrações de
 * telemetria e avarias. Vínculo aberto tem {@code fim} nulo.</p>
 */
@Entity
@Table(name = "frota_vinculos_condutor")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class VinculoCondutor extends BaseEntity {

    @Column(name = "id_veiculo", nullable = false, updatable = false)
    private UUID idVeiculo;

    @Column(name = "id_colaborador", nullable = false, updatable = false)
    private UUID idColaborador;

    @Column(name = "inicio", nullable = false, updatable = false)
    private OffsetDateTime inicio;

    @Column(name = "fim")
    private OffsetDateTime fim;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem", nullable = false, length = 20, updatable = false)
    private OrigemVinculoCondutor origem;

    @Column(name = "id_origem", updatable = false)
    private UUID idOrigem;

    @Column(name = "observacao", length = 500)
    private String observacao;

    /** CNH que não permitia dirigir no início (vínculo aberto pelo checklist, que só avisa). */
    @Column(name = "cnh_situacao_inicio", length = 30)
    private String cnhSituacaoInicio;

    public VinculoCondutor(UUID idVeiculo, UUID idColaborador, OffsetDateTime inicio,
                           OrigemVinculoCondutor origem, UUID idOrigem, String observacao) {
        if (idVeiculo == null) throw new InvarianteVioladaException("Informe o veículo.");
        if (idColaborador == null) throw new InvarianteVioladaException("Informe o condutor.");
        this.idVeiculo = idVeiculo;
        this.idColaborador = idColaborador;
        this.inicio = Periodo.inicioValido(inicio);
        this.origem = Objects.requireNonNull(origem, "A origem do vínculo é obrigatória");
        this.idOrigem = idOrigem;
        this.observacao = Textos.opcional(observacao, 500);
    }

    public boolean isAberto() {
        return fim == null;
    }

    public boolean vigenteEm(OffsetDateTime instante) {
        return Periodo.contem(inicio, fim, instante);
    }

    /** O condutor assumiu pelo checklist com a CNH vencida, ausente ou de categoria abaixo. */
    public void marcarCnhNoInicio(String situacao) {
        this.cnhSituacaoInicio = Textos.opcional(situacao, 30);
    }

    public void encerrar(OffsetDateTime fim) {
        if (!isAberto()) {
            throw new InvarianteVioladaException("Este vínculo já foi encerrado.");
        }
        this.fim = Periodo.fimValido(inicio, fim);
    }
}
