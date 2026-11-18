package com.nexo.app.modules.estoque.application.dto;

import com.nexo.app.modules.estoque.domain.SituacaoFechamentoObra;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoSolicitacao;
import com.nexo.app.modules.estoque.domain.SituacaoPrazoFechamento;
import com.nexo.app.modules.estoque.domain.TipoSolicitacaoTecnica;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Filtros da lista de fechamento; "Minhas" chega aqui como o solicitante logado. */
public record FechamentoObraFilter(
        UUID idSolicitante,
        UUID idObra,
        List<TipoSolicitacaoTecnica> tipos,
        List<SituacaoFechamentoSolicitacao> situacoes,
        SituacaoPrazoFechamento prazo,
        Boolean comPendencia,
        UUID idSupervisor,
        UUID idCoordenador,
        UUID idEncarregado,
        SituacaoFechamentoObra situacaoObra,
        String reserva,
        UUID idAlmoxarifado,
        LocalDate criadaDe,
        LocalDate criadaAte,
        LocalDate agendaDe,
        LocalDate agendaAte,
        String busca
) {
    public static FechamentoObraFilter vazio() {
        return new FechamentoObraFilter(null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null);
    }
}
