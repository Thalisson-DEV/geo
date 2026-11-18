package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.MotivoServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoAprovacaoOrcamento;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.CausaManutencao;
import com.nexo.app.modules.frota.domain.TipoOficina;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * OS como aparece na lista e no cabeçalho da ficha. {@code oficina} é o nome pronto para
 * exibir (fornecedor cadastrado ou nome livre); {@code itens}, os nomes dos itens.
 */
public record OrdemServicoResponse(
        UUID id,
        Long numero,
        UUID idVeiculo,
        String placa,
        /** Falso na OS de ferramental, oficina ou equipamento sem placa. */
        boolean veicular,
        String descricaoEquipamento,
        UUID idBaseOperacional,
        String base,
        TipoManutencao tipoManutencao,
        OrigemOrdemServico origem,
        Criticidade criticidade,
        MotivoServico motivo,
        SituacaoOrdemServico situacao,
        String descricao,
        List<String> itens,
        UUID idCondutor,
        String condutor,
        OffsetDateTime abertaEm,
        String usuarioAbertura,
        Long kmAbertura,
        /** Unidade de kmAbertura e kmEncerramento: KM ou HORAS (horímetro). */
        UnidadeMedicao unidadeMedicao,
        TipoOficina tipoOficina,
        UUID idFornecedor,
        String oficinaNome,
        String oficina,
        OffsetDateTime agendadaPara,
        String localAgendamento,
        OffsetDateTime inicioReal,
        OffsetDateTime previsaoTermino,
        OffsetDateTime fimReal,
        /** Quando a OS ficou com todos os valores lançados; nula na aberta ou com valores pendentes. */
        OffsetDateTime finalizadaEm,
        /** Concluída com valores pendentes: falta o valor de algum serviço ou peça (ver pendencias no detalhe). */
        boolean baixaPendente,
        boolean atrasada,
        boolean veiculoParado,
        OffsetDateTime paradoDesde,
        OffsetDateTime liberadoEm,
        boolean paradaEmCurso,
        String descricaoServico,
        String itensSubstituidos,
        BigDecimal valorTotal,
        Long kmEncerramento,
        CausaManutencao causa,
        OffsetDateTime canceladaEm,
        String motivoCancelamento,
        SituacaoAprovacaoOrcamento situacaoAprovacao,
        int quantidadeOrcamentos,
        boolean temRepeticao
) {
}
