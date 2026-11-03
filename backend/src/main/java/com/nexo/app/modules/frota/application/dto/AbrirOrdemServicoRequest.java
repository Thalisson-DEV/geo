package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.MotivoServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.TipoOficina;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Abertura de OS. {@code abertaEm} nula usa o instante atual; {@code idCondutor} nulo
 * usa quem dirigia o veículo na abertura; {@code veiculoParado} nulo segue a criticidade
 * (urgente para o veículo).
 *
 * <p>Sem {@code idVeiculo}, a OS é não veicular (ferramental, oficina, equipamento sem
 * placa) e exige {@code idBaseOperacional} e {@code descricaoEquipamento}.</p>
 */
public record AbrirOrdemServicoRequest(
        UUID idVeiculo,
        @NotNull(message = "Informe o tipo de manutenção.") TipoManutencao tipoManutencao,
        @NotNull(message = "Informe a origem da OS.") OrigemOrdemServico origem,
        @NotNull(message = "Informe a criticidade.") Criticidade criticidade,
        MotivoServico motivo,
        @NotBlank(message = "Descreva o problema ou o serviço.") @Size(max = 2000) String descricao,
        @NotEmpty(message = "Informe ao menos um item de manutenção.") @Size(max = 30) List<@NotNull UUID> idsItem,
        UUID idCondutor,
        OffsetDateTime abertaEm,
        @PositiveOrZero Long kmAbertura,
        TipoOficina tipoOficina,
        UUID idFornecedor,
        @Size(max = 150) String oficinaNome,
        Boolean veiculoParado,
        UUID idBaseOperacional,
        @Size(max = 150) String descricaoEquipamento
) {
    public AbrirOrdemServicoRequest(UUID idVeiculo, TipoManutencao tipoManutencao, OrigemOrdemServico origem,
                                    Criticidade criticidade, MotivoServico motivo, String descricao, List<UUID> idsItem,
                                    UUID idCondutor, OffsetDateTime abertaEm, Long kmAbertura, TipoOficina tipoOficina,
                                    UUID idFornecedor, String oficinaNome, Boolean veiculoParado) {
        this(idVeiculo, tipoManutencao, origem, criticidade, motivo, descricao, idsItem, idCondutor, abertaEm, kmAbertura,
                tipoOficina, idFornecedor, oficinaNome, veiculoParado, null, null);
    }
}
