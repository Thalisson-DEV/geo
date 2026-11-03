package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoSinistro;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Registro ou correção do sinistro. Sem condutor, fica quem estava vinculado ao veículo no
 * instante do sinistro. O veículo não muda depois do registro.
 */
public record SinistroRequest(
        @NotNull(message = "Escolha o veículo.") UUID idVeiculo,
        @NotNull(message = "Informe a data e hora do sinistro.") OffsetDateTime ocorridoEm,
        @Size(max = 300) String local,
        @NotNull(message = "Escolha o tipo do sinistro.") TipoSinistro tipo,
        UUID idCondutor,
        Boolean culpaCondutor,
        @NotBlank(message = "Descreva o que aconteceu.") @Size(max = 4000) String descricao,
        @Size(max = 2000) String terceiros,
        @Size(max = 60) String boletimOcorrencia
) {
}
