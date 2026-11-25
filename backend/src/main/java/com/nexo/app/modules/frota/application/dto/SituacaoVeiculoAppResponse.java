package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.SituacaoOperacional;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist;
import com.nexo.app.modules.frota.domain.SituacaoPreventiva;
import com.nexo.app.modules.frota.domain.SituacaoVencimento;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.domain.UnidadeMedicao;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * O que quem usa o veículo precisa saber dele no app: se está liberado, o que está em manutenção,
 * os problemas do checklist ainda sem solução, os documentos que vencem e as revisões chegando.
 */
public record SituacaoVeiculoAppResponse(
        UUID idVeiculo,
        String placa,
        String modelo,
        String baseOperacional,
        SituacaoOperacional situacao,
        Long medicaoAtual,
        OffsetDateTime medicaoAtualEm,
        UnidadeMedicao unidadeMedicao,
        String condutorAtual,
        List<Ordem> ordensAbertas,
        List<Ordem> ultimasConcluidas,
        List<Pendencia> pendencias,
        List<Documento> documentos,
        /** As 5 lavagens mais recentes, sem valor: o gestor confere em campo. */
        List<Lavagem> ultimasLavagens,
        /** Planos preventivos próximos ou vencidos, do mais urgente para o menos. */
        List<Preventiva> preventivas,
        /**
         * Todos os documentos do veículo e dos implementos acoplados agora (CRLV, tacógrafo, laudo),
         * com ou sem arquivo: o app mostra a lista na consulta e guarda os arquivos para a
         * fiscalização mesmo sem sinal.
         */
        List<DocumentoConjunto> documentosDoConjunto
) {

    /**
     * Documento do conjunto (veículo ou implemento, identificado em {@code titular}). Sem arquivo,
     * {@code arquivoNome} e {@code versao} vêm nulos; {@code versao} muda quando o arquivo é trocado,
     * e o app só baixa de novo nesse caso.
     */
    public record DocumentoConjunto(UUID id, String tipo, String descricao, String titular, boolean doImplemento,
                                    LocalDate vencimento, SituacaoVencimento situacao, String arquivoNome,
                                    String arquivoContentType, Long arquivoTamanhoBytes, String versao,
                                    /** Nome do tipo no cadastro do cliente. */ String tipoRotulo) {
    }

    /** Ex.: "Revisão 10 mil km" · "faltam 800 km"; {@code numeroOrdem} quando a OS já foi aberta. */
    public record Preventiva(String plano, SituacaoPreventiva situacao, String falta, LocalDate previsao, Long numeroOrdem) {
    }

    public record Lavagem(LocalDate data, String subtipo, String lancadoPor) {
    }

    public record Ordem(
            UUID id,
            Long numero,
            TipoManutencao tipoManutencao,
            SituacaoOrdemServico situacao,
            Criticidade criticidade,
            String descricao,
            String oficina,
            boolean veiculoParado,
            OffsetDateTime abertaEm,
            OffsetDateTime agendadaPara,
            String localAgendamento,
            OffsetDateTime previsaoTermino,
            OffsetDateTime fimReal
    ) {
    }

    /** Não OK de checklist ainda sem solução: aguardando o gestor ou com OS aberta. */
    public record Pendencia(UUID id, String item, SituacaoPendenciaChecklist situacao, Long numeroOrdem, OffsetDateTime desde) {
    }

    public record Documento(String tipo, String descricao, LocalDate vencimento, SituacaoVencimento situacao, String tipoRotulo) {
    }
}
