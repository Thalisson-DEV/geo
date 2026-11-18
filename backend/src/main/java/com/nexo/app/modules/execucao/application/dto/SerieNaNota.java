package com.nexo.app.modules.execucao.application.dto;

import com.nexo.app.modules.execucao.domain.OrigemMaterial;
import com.nexo.app.modules.execucao.domain.StatusExecucao;
import com.nexo.app.modules.execucao.domain.TipoNota;
import com.nexo.app.shared.application.dto.OperacaoMaterial;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Um material com número de série lançado numa nota: responde "em qual nota este medidor foi aplicado".
 *
 * @param serieInformada a série como foi pedida
 * @param exata          falso quando a série lançada só contém o que foi pedido
 * @param referenciaNota número da nota; na avulsa que ainda espera o oficial, o provisório
 */
public record SerieNaNota(
        String serieInformada,
        String numeroSerie,
        boolean exata,
        UUID idExecucao,
        String referenciaNota,
        TipoNota tipoNota,
        boolean aguardandoNumeroOficial,
        OffsetDateTime dataLancamento,
        StatusExecucao statusExecucao,
        OperacaoMaterial operacao,
        OrigemMaterial origem,
        String materialCodigo,
        String material,
        String equipe,
        String baseOperacional
) {
}
