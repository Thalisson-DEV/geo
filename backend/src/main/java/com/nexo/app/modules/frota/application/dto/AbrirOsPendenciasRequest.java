package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.TipoOficina;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * Abre uma OS (origem checklist) para uma ou mais pendências abertas do mesmo veículo. A descrição
 * é montada com a pergunta, o motivo e o comentário de cada uma; {@code observacao} é somada a ela.
 * Criticidade vazia = média. A oficina (interna ou externa, com fornecedor do financeiro ou
 * nome) é opcional e já pode vir na abertura, porque muitos serviços têm fornecedor certo.
 */
public record AbrirOsPendenciasRequest(
        @NotEmpty(message = "Escolha ao menos uma pendência.") @Size(max = 30) List<@NotNull UUID> idsPendencia,
        @NotEmpty(message = "Informe ao menos um item de manutenção.") @Size(max = 30) List<@NotNull UUID> idsItem,
        Criticidade criticidade,
        @Size(max = 500) String observacao,
        TipoOficina tipoOficina,
        UUID idFornecedor,
        @Size(max = 150) String oficinaNome
) {
    public AbrirOsPendenciasRequest(List<UUID> idsPendencia, List<UUID> idsItem, Criticidade criticidade, String observacao) {
        this(idsPendencia, idsItem, criticidade, observacao, null, null, null);
    }
}
