package com.nexo.app.modules.assistente.application.rastreio;

import java.time.OffsetDateTime;

/**
 * Um lancamento de material com numero de serie em uma nota.
 *
 * @param serieInformada a serie como o usuario pediu
 * @param numeroSerie    a serie como foi lancada
 * @param exata          falso quando a serie lancada so contem o que foi pedido
 * @param nota           numero da nota (ou o provisorio, na avulsa que ainda espera o oficial)
 * @param operacao       APLICADO ou RETIRADO
 */
public record SerieEncontrada(
        String serieInformada,
        String numeroSerie,
        boolean exata,
        String nota,
        String tipoNota,
        boolean aguardandoNumeroOficial,
        OffsetDateTime dataLancamento,
        String operacao,
        String materialCodigo,
        String material,
        String origem,
        String equipe,
        String baseOperacional,
        String statusNota
) {
}
