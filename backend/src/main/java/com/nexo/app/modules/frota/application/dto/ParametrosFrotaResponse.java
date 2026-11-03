package com.nexo.app.modules.frota.application.dto;

import java.time.LocalTime;
import java.util.List;

public record ParametrosFrotaResponse(List<Integer> faixasAlertaDias, Integer limiteKmDia, Integer janelaRepeticaoDias,
                                      Integer limiteHorasDia, Integer limiteSaltoKm, Integer limiteSaltoHoras,
                                      Expediente expediente) {

    public record Expediente(LocalTime inicio, LocalTime fim, boolean sabado) {
    }
}
