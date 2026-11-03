package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.MotivoServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.TipoOficina;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/** Dados de abertura editáveis enquanto a OS está aberta (veículo, data e KM não mudam). */
public record EditarOrdemServicoRequest(
        @NotNull(message = "Informe o tipo de manutenção.") TipoManutencao tipoManutencao,
        @NotNull(message = "Informe a origem da OS.") OrigemOrdemServico origem,
        @NotNull(message = "Informe a criticidade.") Criticidade criticidade,
        MotivoServico motivo,
        @NotBlank(message = "Descreva o problema ou o serviço.") @Size(max = 2000) String descricao,
        @NotEmpty(message = "Informe ao menos um item de manutenção.") @Size(max = 30) List<@NotNull UUID> idsItem,
        UUID idCondutor,
        TipoOficina tipoOficina,
        UUID idFornecedor,
        @Size(max = 150) String oficinaNome
) {
}
