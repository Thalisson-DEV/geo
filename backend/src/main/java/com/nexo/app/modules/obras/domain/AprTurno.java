package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.BaseEntity;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Análise preliminar de riscos: o formulário que a equipe preenche durante o dia de trabalho, antes de executar um
 * serviço. Sem APR concluída do serviço no dia, não há apontamento. Depois de concluída, não muda mais.
 */
@Entity
@Table(name = "turno_aprs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AprTurno extends BaseEntity {

    @Column(name = "id_turno", nullable = false, updatable = false)
    private UUID idTurno;

    @Column(name = "id_obra")
    private UUID idObra;

    /** O serviço programado que esta APR libera; nula em atividade de obra não programada. */
    @Column(name = "id_programacao")
    private UUID idProgramacao;

    @Column(name = "atividade", nullable = false, length = 500)
    private String atividade;

    @Column(name = "id_responsavel")
    private UUID idResponsavel;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private StatusAprTurno status = StatusAprTurno.RASCUNHO;

    @Column(name = "data_conclusao")
    private OffsetDateTime dataConclusao;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "formulario", columnDefinition = "jsonb")
    private FormularioApr formulario;

    /** Quando veio do app: id do aparelho, hora e GPS. Nula na APR lançada antes do app. */
    @Embedded
    private RegistroCampo campo;

    /** Id do aparelho do comando de conclusão, para o reenvio não falhar. */
    @Column(name = "id_local_conclusao")
    private UUID idLocalConclusao;

    /** Participantes que assinaram na tela do encarregado. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "assinaturas", columnDefinition = "jsonb")
    private List<Assinatura> assinaturas;

    /** Assinatura de um participante; a imagem vem em PNG (base64). */
    public record Assinatura(UUID idColaborador, String nome, OffsetDateTime assinadaEm, String imagemPng) {
    }

    public AprTurno(UUID idTurno, UUID idObra, UUID idProgramacao, String atividade, UUID idResponsavel, FormularioApr formulario) {
        this.idTurno = Objects.requireNonNull(idTurno);
        informar(idObra, idProgramacao, atividade, idResponsavel, formulario);
    }

    /** APR lançada pelo app, com o id gerado no aparelho. */
    public static AprTurno doCampo(UUID idTurno, UUID idObra, UUID idProgramacao, String atividade, UUID idResponsavel,
                                   FormularioApr formulario, List<Assinatura> assinaturas, RegistroCampo campo) {
        AprTurno apr = new AprTurno(idTurno, idObra, idProgramacao, atividade, idResponsavel, formulario);
        apr.campo = Objects.requireNonNull(campo);
        apr.assinaturas = assinaturas == null || assinaturas.isEmpty() ? null : List.copyOf(assinaturas);
        return apr;
    }

    /**
     * Conclusão feita no aparelho, possivelmente horas antes de chegar ao servidor: vale a hora do aparelho, para a
     * APR das 08:10 liberar o apontamento das 10:30 enviados juntos à noite. Hora no futuro vira a hora do servidor.
     */
    public void concluirEm(OffsetDateTime momento, UUID idLocal) {
        if (status == StatusAprTurno.CONCLUIDA) {
            return;
        }
        concluir();
        OffsetDateTime agora = OffsetDateTime.now();
        if (momento != null && !momento.isAfter(agora.plus(RegistroCampo.TOLERANCIA_RELOGIO))) {
            this.dataConclusao = momento.isAfter(agora) ? agora : momento;
        }
        this.idLocalConclusao = idLocal;
    }

    public void informar(UUID idObra, UUID idProgramacao, String atividade, UUID idResponsavel, FormularioApr formulario) {
        if (status == StatusAprTurno.CONCLUIDA) {
            throw new InvarianteVioladaException("A APR já foi concluída e não pode mais ser alterada.");
        }
        if (idObra == null) {
            throw new InvarianteVioladaException("Informe a obra da APR.");
        }
        if (atividade == null || atividade.isBlank()) {
            throw new InvarianteVioladaException("Informe a atividade da APR.");
        }
        this.idObra = idObra;
        this.idProgramacao = idProgramacao;
        this.atividade = atividade.trim();
        this.idResponsavel = idResponsavel;
        this.formulario = formulario;
    }

    public void concluir() {
        if (idResponsavel == null) {
            throw new InvarianteVioladaException("Informe o responsável antes de concluir a APR.");
        }
        if (formulario == null) {
            throw new InvarianteVioladaException("Preencha o formulário antes de concluir a APR.");
        }
        formulario.validarConclusao();
        if (status == StatusAprTurno.RASCUNHO) {
            this.status = StatusAprTurno.CONCLUIDA;
            this.dataConclusao = OffsetDateTime.now();
        }
    }

    public void excluir() {
        if (status == StatusAprTurno.CONCLUIDA) {
            throw new InvarianteVioladaException("A APR já foi concluída e não pode ser excluída.");
        }
        desativar();
    }
}
