package com.nexo.app.modules.frota.domain;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Objects;

/**
 * Janela em que o uso do veículo é esperado: de segunda a sexta (e no sábado, se o gestor ligar),
 * entre o início e o fim, no fuso de São Paulo. Fora dela, andar conta como uso fora do expediente.
 * Feriados não são descontados: o GEO não tem calendário de feriados.
 */
public record Expediente(LocalTime inicio, LocalTime fim, boolean sabado) {

    public static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    public Expediente {
        Objects.requireNonNull(inicio, "O início do expediente é obrigatório");
        Objects.requireNonNull(fim, "O fim do expediente é obrigatório");
    }

    public boolean dentro(OffsetDateTime instante) {
        var local = instante.atZoneSameInstant(FUSO);
        DayOfWeek dia = local.getDayOfWeek();
        if (dia == DayOfWeek.SUNDAY || (dia == DayOfWeek.SATURDAY && !sabado)) {
            return false;
        }
        LocalTime hora = local.toLocalTime();
        return !hora.isBefore(inicio) && hora.isBefore(fim);
    }
}
