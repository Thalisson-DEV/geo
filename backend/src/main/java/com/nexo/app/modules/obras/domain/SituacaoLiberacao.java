package com.nexo.app.modules.obras.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Collection;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Se a equipe pode executar no dia. A APR é a análise preliminar de riscos, feita antes do serviço: uma APR concluída no
 * dia libera todos os serviços da equipe naquele dia, e a equipe pode fazer outras ao longo do dia (outra obra, outra
 * condição). Registrado que não há condição de executar numa obra, ela fica bloqueada até uma APR dessa obra concluída
 * depois do registro.
 */
public enum SituacaoLiberacao {
    PENDENTE,
    EM_PREENCHIMENTO,
    LIBERADA,
    IMPEDIDA;

    /**
     * Considera só os registros do dia: APR de ontem não libera o serviço de hoje, nem em turno que atravessou a noite.
     *
     * @param aprs as APRs da equipe no dia (de qualquer obra e de qualquer turno do dia).
     */
    public static SituacaoLiberacao avaliar(UUID idObra, LocalDate dia, ZoneId fuso,
                                            Collection<AprTurno> aprs, Collection<OcorrenciaTurno> ocorrencias) {
        return avaliar(idObra, dia, fuso, aprs, ocorrencias, null);
    }

    /**
     * Avaliação no momento em que a equipe fez o registro, como o aparelho informou: o que aconteceu depois (uma
     * ocorrência impeditiva da tarde, enviada junto à noite) não muda a liberação do apontamento da manhã, e a APR
     * concluída depois do apontamento não o libera.
     *
     * @param ate o instante do registro avaliado; nulo considera o dia inteiro.
     */
    public static SituacaoLiberacao avaliar(UUID idObra, LocalDate dia, ZoneId fuso,
                                            Collection<AprTurno> aprs, Collection<OcorrenciaTurno> ocorrencias,
                                            OffsetDateTime ate) {
        Optional<OffsetDateTime> impedimento = ocorrencias.stream()
                .filter(o -> o.isImpedeExecucao() && idObra.equals(o.getIdObra()))
                .map(OcorrenciaTurno::momento)
                .filter(momento -> doDia(momento, dia, fuso))
                .filter(momento -> ate == null || !momento.isAfter(ate))
                .max(OffsetDateTime::compareTo);
        Optional<OffsetDateTime> concluidaNoDia = concluidaAte(aprs.stream(), dia, fuso, ate);
        if (impedimento.isPresent()) {
            Optional<OffsetDateTime> daObra = concluidaAte(aprs.stream().filter(a -> idObra.equals(a.getIdObra())), dia, fuso, ate);
            if (daObra.isEmpty() || daObra.get().isBefore(impedimento.get())) {
                return IMPEDIDA;
            }
        }
        if (concluidaNoDia.isPresent()) {
            return LIBERADA;
        }
        return aprs.stream().anyMatch(a -> a.getStatus() == StatusAprTurno.RASCUNHO && doDia(a.getDataCriacao(), dia, fuso))
                ? EM_PREENCHIMENTO : PENDENTE;
    }

    private static Optional<OffsetDateTime> concluidaAte(java.util.stream.Stream<AprTurno> aprs, LocalDate dia, ZoneId fuso, OffsetDateTime ate) {
        return aprs.filter(a -> a.getStatus() == StatusAprTurno.CONCLUIDA)
                .map(AprTurno::getDataConclusao)
                .filter(Objects::nonNull)
                .filter(momento -> doDia(momento, dia, fuso))
                .filter(momento -> ate == null || !momento.isAfter(ate))
                .max(OffsetDateTime::compareTo);
    }

    private static boolean doDia(OffsetDateTime momento, LocalDate dia, ZoneId fuso) {
        return momento == null || momento.atZoneSameInstant(fuso).toLocalDate().equals(dia);
    }
}
