package com.nexo.app.shared.domain;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Objects;

/**
 * Contagem de prazos em horas úteis: só correm as horas de segunda a sexta, exceto
 * feriados nacionais, no fuso de São Paulo. Um instante em dia não útil passa a contar
 * às 00h do próximo dia útil.
 */
public final class HorasUteis {

    public static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private HorasUteis() {
    }

    public static boolean diaUtil(LocalDate dia) {
        DayOfWeek semana = dia.getDayOfWeek();
        return semana != DayOfWeek.SATURDAY && semana != DayOfWeek.SUNDAY && !FeriadosNacionais.feriado(dia);
    }

    /** Instante em que terminam {@code horas} horas úteis contadas a partir de {@code inicio}. */
    public static OffsetDateTime somar(OffsetDateTime inicio, long horas) {
        Objects.requireNonNull(inicio, "O início é obrigatório");
        if (horas < 0) {
            throw new IllegalArgumentException("As horas úteis não podem ser negativas");
        }
        ZonedDateTime cursor = proximoInstanteUtil(inicio.atZoneSameInstant(FUSO));
        long restante = Duration.ofHours(horas).toSeconds();
        while (true) {
            ZonedDateTime fimDoDia = cursor.toLocalDate().plusDays(1).atStartOfDay(FUSO);
            long disponivel = Duration.between(cursor, fimDoDia).toSeconds();
            if (restante <= disponivel) {
                return cursor.plusSeconds(restante).toOffsetDateTime();
            }
            restante -= disponivel;
            cursor = proximoInstanteUtil(fimDoDia);
        }
    }

    /** Horas úteis (em segundos) entre dois instantes; zero quando {@code ate} não é posterior. */
    public static Duration entre(OffsetDateTime de, OffsetDateTime ate) {
        Objects.requireNonNull(de, "O início é obrigatório");
        Objects.requireNonNull(ate, "O fim é obrigatório");
        if (!ate.isAfter(de)) {
            return Duration.ZERO;
        }
        ZonedDateTime fim = ate.atZoneSameInstant(FUSO);
        ZonedDateTime cursor = proximoInstanteUtil(de.atZoneSameInstant(FUSO));
        long total = 0;
        while (cursor.isBefore(fim)) {
            ZonedDateTime fimDoDia = cursor.toLocalDate().plusDays(1).atStartOfDay(FUSO);
            ZonedDateTime limite = fimDoDia.isBefore(fim) ? fimDoDia : fim;
            total += Duration.between(cursor, limite).toSeconds();
            cursor = proximoInstanteUtil(fimDoDia);
        }
        return Duration.ofSeconds(total);
    }

    private static ZonedDateTime proximoInstanteUtil(ZonedDateTime instante) {
        ZonedDateTime cursor = instante;
        while (!diaUtil(cursor.toLocalDate())) {
            cursor = cursor.toLocalDate().plusDays(1).atStartOfDay(FUSO);
        }
        return cursor;
    }
}
