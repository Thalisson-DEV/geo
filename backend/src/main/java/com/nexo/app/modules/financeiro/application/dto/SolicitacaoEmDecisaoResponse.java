package com.nexo.app.modules.financeiro.application.dto;

import com.nexo.app.modules.financeiro.domain.TipoSolicitacao;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Uma solicitação vista por quem decide fora da tela (Bússola, IAs conectadas): o bastante para saber, sem
 * dúvida, qual é e o que está sendo aprovado.
 *
 * @param ficha a solicitação inteira em pares rótulo/valor, a mesma do e-mail de decisão (vazia na fila)
 */
public record SolicitacaoEmDecisaoResponse(
        UUID id,
        TipoSolicitacao tipo,
        Long numero,
        String titulo,
        String situacao,
        boolean aguardandoDecisao,
        String solicitante,
        String fornecedor,
        BigDecimal valor,
        BigDecimal valorAprovado,
        String descricao,
        String base,
        OffsetDateTime dataSubmissao,
        String caminho,
        List<CampoFicha> ficha
) {

    public record CampoFicha(String rotulo, String valor) {
    }
}
