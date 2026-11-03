package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.SituacaoSinistro;
import com.nexo.app.modules.frota.domain.TipoSinistro;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Filtro dos sinistros.
 *
 * @param busca     trecho da placa
 * @param de        ocorridos a partir do dia
 * @param ate       ocorridos até o dia (inclusive)
 */
public record SinistroFilter(
        UUID idVeiculo,
        String busca,
        List<UUID> idsBase,
        List<TipoSinistro> tipos,
        List<SituacaoSinistro> situacoes,
        UUID idCondutor,
        UUID idApolice,
        LocalDate de,
        LocalDate ate
) {
}
