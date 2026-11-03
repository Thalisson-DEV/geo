package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist;
import com.nexo.app.modules.frota.domain.TipoRespostaChecklist;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Checklist com as respostas como foram dadas, as fotos e o que foi decidido em cada problema. */
public record ChecklistDetalheResponse(
        ChecklistResumoResponse resumo,
        String comentario,
        boolean assinado,
        String justificativaLiberacaoCnh,
        List<Resposta> respostas,
        List<FotoChecklistResponse> fotosRecebimento
) {

    /**
     * @param resposta texto curto da resposta: "OK", o motivo do Não OK, a opção ou o texto livre
     */
    public record Resposta(
            UUID id,
            String grupo,
            String pergunta,
            TipoRespostaChecklist tipoResposta,
            Boolean conforme,
            String resposta,
            String comentario,
            boolean problema,
            List<FotoChecklistResponse> fotos,
            UUID idPendencia,
            SituacaoPendenciaChecklist situacaoPendencia,
            Long numeroOrdemServico,
            UUID idOrdemServico,
            /** Só nas respostas com problema. */
            HistoricoItemChecklistResponse historico,
            /** Decisão do gestor sobre o problema (nulos enquanto aguarda). */
            OffsetDateTime decididaEm,
            String decididaPor,
            String justificativaDecisao
    ) {
    }
}
