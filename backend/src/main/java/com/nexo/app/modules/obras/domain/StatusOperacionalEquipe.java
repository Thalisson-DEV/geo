package com.nexo.app.modules.obras.domain;

import java.time.Duration;
import java.time.OffsetDateTime;

/**
 * Situação da equipe de Obras agora, calculada dos eventos do dia: turno, chegada/saída na obra, apontamentos e
 * "sem condição de executar". O limite de inatividade é configurável.
 */
public enum StatusOperacionalEquipe {
    SEM_TURNO("Sem turno"),
    ENCERRADO("Turno encerrado"),
    A_CAMINHO("A caminho"),
    NA_OBRA("Na obra"),
    EM_EXECUCAO("Executando"),
    PARADA("Parada na obra"),
    IMPEDIDA("Sem condição de executar"),
    SEM_OBRA("Sem obra em andamento");

    private final String rotulo;

    StatusOperacionalEquipe(String rotulo) {
        this.rotulo = rotulo;
    }

    public String rotulo() {
        return rotulo;
    }

    /** Os fatos do dia da equipe, como o servidor os conhece. */
    public record Fatos(boolean turnoAberto, boolean turnoEncerrado, OffsetDateTime ultimaChegada, OffsetDateTime ultimaSaida,
                        OffsetDateTime ultimoApontamento, OffsetDateTime ultimoImpedimento, OffsetDateTime ultimaAprConcluida,
                        boolean temAgendaPendente) {
    }

    /** @param agora referência; {@code inatividade} sem apontamento na obra que vira "parada". */
    public static StatusOperacionalEquipe calcular(Fatos f, OffsetDateTime agora, Duration inatividade) {
        if (!f.turnoAberto()) {
            return f.turnoEncerrado() ? ENCERRADO : SEM_TURNO;
        }
        if (f.ultimoImpedimento() != null && (f.ultimaAprConcluida() == null || f.ultimaAprConcluida().isBefore(f.ultimoImpedimento()))
                && !depois(f.ultimoApontamento(), f.ultimoImpedimento())) {
            return IMPEDIDA;
        }
        boolean naObra = f.ultimaChegada() != null && (f.ultimaSaida() == null || f.ultimaSaida().isBefore(f.ultimaChegada()));
        if (naObra) {
            OffsetDateTime referencia = maisRecente(f.ultimaChegada(), f.ultimoApontamento());
            if (f.ultimoApontamento() != null && !f.ultimoApontamento().isBefore(f.ultimaChegada())
                    && Duration.between(f.ultimoApontamento(), agora).compareTo(inatividade) <= 0) {
                return EM_EXECUCAO;
            }
            return Duration.between(referencia, agora).compareTo(inatividade) > 0 ? PARADA : NA_OBRA;
        }
        if (f.ultimoApontamento() != null && Duration.between(f.ultimoApontamento(), agora).compareTo(inatividade) <= 0) {
            return EM_EXECUCAO;
        }
        return f.temAgendaPendente() ? A_CAMINHO : SEM_OBRA;
    }

    private static boolean depois(OffsetDateTime a, OffsetDateTime b) {
        return a != null && b != null && a.isAfter(b);
    }

    private static OffsetDateTime maisRecente(OffsetDateTime a, OffsetDateTime b) {
        if (a == null) {
            return b;
        }
        return b == null || a.isAfter(b) ? a : b;
    }
}
