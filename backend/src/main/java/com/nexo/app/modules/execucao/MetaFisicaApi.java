package com.nexo.app.modules.execucao;

import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

/** Metas físicas da Concessionária (notas por base, mês e tipo de serviço) para os painéis. */
public interface MetaFisicaApi {

    record MetaFisicaPublica(UUID id, UUID idBaseOperacional, YearMonth competencia, List<ServicoPublico> servicos) {
    }

    record ServicoPublico(UUID idTipoServico, int quantidade) {
    }

    /** Metas ativas dos meses de {@code de} a {@code ate}, inclusive. */
    List<MetaFisicaPublica> listarAtivas(YearMonth de, YearMonth ate);
}
