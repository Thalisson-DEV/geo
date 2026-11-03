package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.UnidadeMedicao;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** O que o app guarda para preencher o checklist sem rede. */
public record CatalogoChecklistAppResponse(
        OffsetDateTime geradoEm,
        List<ModeloChecklistResponse> modelos,
        List<Veiculo> veiculos,
        List<Condutor> condutores,
        List<Liberacao> liberacoesCnh
) {

    /** Condutor com CNH registrada; o app avisa antes de preencher se ela impede o veículo escolhido. */
    public record Condutor(UUID idColaborador, String nome, String categoriaCnh, LocalDate validadeCnh) {
    }

    /** Liberação do gestor para o dia: o app não bloqueia esse condutor nesse veículo. */
    public record Liberacao(UUID idCondutor, UUID idVeiculo, LocalDate dia) {
    }

    /**
     * @param idsModelosPrincipais mais de um: quem preenche escolhe; vazio: veículo sem checklist configurado
     * @param idCondutorAtual      condutor vinculado agora; outro condutor no checklist é troca e pede fotos de recebimento
     * @param limiteSalto          trava do campo: o painel aceita de {@code medicaoAtual} até ela somada a isto
     *                             (nulo = sem limite de salto)
     */
    public record Veiculo(
            UUID idVeiculo,
            String placa,
            String descricao,
            UUID idBaseOperacional,
            String baseNome,
            UnidadeMedicao unidadeMedicao,
            String categoriaCnhExigida,
            Long medicaoAtual,
            List<UUID> idsModelosPrincipais,
            List<UUID> idsModelosAdicionais,
            UUID idCondutorAtual,
            String condutorAtualNome,
            Integer limiteSalto
    ) {
    }
}
