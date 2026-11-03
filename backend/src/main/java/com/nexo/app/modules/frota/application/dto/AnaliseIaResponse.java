package com.nexo.app.modules.frota.application.dto;

import com.nexo.app.modules.frota.domain.AlvoAnaliseIa;
import com.nexo.app.modules.frota.domain.ParecerAnaliseIa;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Parecer da IA sobre o registro.
 *
 * @param fotosNaoLidas fotos que não foram para a IA (ainda no celular, formato não suportado ou acima do limite)
 */
public record AnaliseIaResponse(
        UUID id,
        AlvoAnaliseIa alvo,
        UUID idAlvo,
        ParecerAnaliseIa parecer,
        String parecerRotulo,
        String resumo,
        List<Ponto> pontos,
        List<Foto> fotos,
        List<String> recomendacoes,
        int fotosAnalisadas,
        List<String> fotosNaoLidas,
        String modelo,
        OffsetDateTime geradaEm,
        String geradaPor
) {

    /** @param gravidade INFO, ATENCAO ou CRITICO */
    public record Ponto(String titulo, String detalhe, String gravidade) {
    }

    /**
     * Leitura de uma foto.
     *
     * @param origem    CHECKLIST, ABASTECIMENTO ou DOCUMENTO_FISCAL: onde a foto mora (para a tela abrir a imagem)
     * @param idOrigem  checklist, abastecimento ou OS dona da foto
     * @param resultado CONFERE, DIVERGE, ILEGIVEL ou SEM_RELACAO
     */
    public record Foto(String ref, String origem, UUID idOrigem, UUID idFoto, String rotulo, String leitura,
                       String resultado, String observacao) {
    }

    /** Estado da análise para o relatório: se a IA está ligada e a última análise, se houver. */
    public record Estado(boolean disponivel, String motivoIndisponivel, AnaliseIaResponse ultima) {
    }
}
