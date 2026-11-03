package com.nexo.app.modules.frota.application.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Cadastro ou correção do pneu. Vida, km já rodado na vida, sulco atual e almoxarifado só valem
 * no cadastro; depois mudam pela movimentação, inspeção e reforma.
 */
public record PneuRequest(
        @NotBlank(message = "Informe a marca de fogo.") @Size(max = 30) String marcaFogo,
        @Size(max = 60) String numeroSerie,
        @NotBlank(message = "Informe a marca do pneu.") @Size(max = 60) String marca,
        @Size(max = 80) String modelo,
        @Min(100) @Max(500) Integer largura,
        @Min(10) @Max(120) Integer perfil,
        @Size(max = 10) String aro,
        Boolean radial,
        Boolean comCamara,
        @Size(max = 10) String indiceCarga,
        @Size(max = 5) String indiceVelocidade,
        @Min(1) @Max(40) Integer lonas,
        @Size(max = 4) String dot,
        UUID idFornecedor,
        @Size(max = 60) String notaFiscal,
        LocalDate dataCompra,
        @DecimalMin("0") @Digits(integer = 10, fraction = 2) BigDecimal valorCompra,
        @DecimalMin("0") @DecimalMax("40") @Digits(integer = 2, fraction = 1) BigDecimal sulcoInicialMm,
        @Min(1) @Max(200) Integer pressaoRecomendadaPsi,
        @Size(max = 1000) String observacao,
        @Min(0) @Max(20) Integer vida,
        @Min(0) Integer kmVida,
        @DecimalMin("0") @DecimalMax("40") @Digits(integer = 2, fraction = 1) BigDecimal sulcoAtualMm,
        UUID idEstoque
) {
}
