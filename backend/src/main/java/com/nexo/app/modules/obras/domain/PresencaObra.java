package com.nexo.app.modules.obras.domain;

import com.nexo.app.shared.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;
import java.util.UUID;

/**
 * Chegada ou saída da equipe numa obra, tocada no app ("Cheguei", "Saí") com o GPS do momento. Alimenta o status da
 * equipe e as horas na obra.
 */
@Entity
@Table(name = "obra_presencas")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PresencaObra extends BaseEntity {

    public enum Tipo {
        CHEGADA,
        SAIDA
    }

    @Column(name = "id_turno", nullable = false, updatable = false)
    private UUID idTurno;

    @Column(name = "id_equipe", nullable = false, updatable = false)
    private UUID idEquipe;

    @Column(name = "id_obra", nullable = false, updatable = false)
    private UUID idObra;

    @Column(name = "id_programacao", updatable = false)
    private UUID idProgramacao;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 10, updatable = false)
    private Tipo tipo;

    @Embedded
    private RegistroCampo campo;

    public PresencaObra(UUID idTurno, UUID idEquipe, UUID idObra, UUID idProgramacao, Tipo tipo, RegistroCampo campo) {
        this.idTurno = Objects.requireNonNull(idTurno);
        this.idEquipe = Objects.requireNonNull(idEquipe);
        this.idObra = Objects.requireNonNull(idObra);
        this.idProgramacao = idProgramacao;
        this.tipo = Objects.requireNonNull(tipo);
        this.campo = Objects.requireNonNull(campo);
    }
}
