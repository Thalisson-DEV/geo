package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.MotivoServico;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.TipoOficina;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * OS de reparo aberta pelo sinistro. Veículo e origem vêm do sinistro; sem descrição, vai o relato
 * dele; sem condutor, o do sinistro.
 */
public record AbrirReparoSinistroRequest(
        @NotNull(message = "Informe o tipo de manutenção.") TipoManutencao tipoManutencao,
        @NotNull(message = "Informe a criticidade.") Criticidade criticidade,
        MotivoServico motivo,
        @Size(max = 2000) String descricao,
        @NotEmpty(message = "Informe ao menos um item de manutenção.") @Size(max = 30) List<@NotNull UUID> idsItem,
        UUID idCondutor,
        OffsetDateTime abertaEm,
        @PositiveOrZero Long kmAbertura,
        TipoOficina tipoOficina,
        UUID idFornecedor,
        @Size(max = 150) String oficinaNome,
        Boolean veiculoParado
) {
}
