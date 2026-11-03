package com.nexo.app.modules.desconto.application.dto;

import com.nexo.app.modules.desconto.domain.StatusDesconto;
import com.nexo.app.shared.application.SelecaoMultipla;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Recorte da consulta de descontos.
 *
 * <p>{@code status} é de múltipla seleção ({@code ?status=SOLICITADO,VALIDADO}): os atalhos
 * da tela somam status. {@code buscaGlobal} procura no colaborador, motivo, status,
 * observações e no código do desconto.</p>
 */
public record DescontoFilter(
        UUID colaboradorId,
        UUID motivoId,
        List<StatusDesconto> status,
        UUID usuarioSolicitanteId,
        OffsetDateTime dataCriacaoInicio,
        OffsetDateTime dataCriacaoFim,
        OffsetDateTime dataOcorrenciaInicio,
        OffsetDateTime dataOcorrenciaFim,
        String buscaGlobal
) {
    public DescontoFilter {
        status = SelecaoMultipla.normalizar(status);
    }
}
