package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** Mínimo (aviso de reposição) e localização física da peça num almoxarifado. */
public record ParametrosPecaFrotaRequest(
        @DecimalMin("0") @Digits(integer = 9, fraction = 3) BigDecimal estoqueMinimo,
        @Size(max = 60) String localizacao
) {
}
