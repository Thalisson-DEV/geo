package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.TipoModeloChecklist;
import com.nexo.app.modules.frota.domain.ModoFotoPergunta;
import com.nexo.app.modules.frota.domain.TipoRespostaChecklist;

import java.util.List;
import java.util.UUID;

/** Modelo com as perguntas, opções, motivos e fotos de recebimento em uso. */
public record ModeloChecklistResponse(
        UUID id,
        String nome,
        TipoModeloChecklist tipo,
        String tipoRotulo,
        String instrucoes,
        boolean exigeAssinatura,
        List<OpcaoFrota> tiposVeiculo,
        List<OpcaoFrota> tiposImplemento,
        List<Pergunta> perguntas,
        List<FotoRecebimento> fotosRecebimento,
        boolean ativo
) {

    public record Pergunta(
            UUID id,
            int ordem,
            String grupo,
            String texto,
            TipoRespostaChecklist tipoResposta,
            boolean fotoNoNaoOk,
            ModoFotoPergunta modoFoto,
            List<Alternativa> opcoes,
            List<Alternativa> motivos
    ) {
    }

    public record Alternativa(UUID id, String texto, boolean indicaProblema) {
    }

    public record FotoRecebimento(UUID id, String descricao) {
    }
}
