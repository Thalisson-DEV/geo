package com.nexo.app.modules.obras.application.dto;

import com.nexo.app.modules.obras.domain.TipoObra;
import org.springframework.format.annotation.DateTimeFormat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record ObraFilter(
        String buscaGlobal,
        String numero,
        String titulo,
        String notaObra,
        TipoObra tipoObra,
        UUID tipoObraId,
        UUID statusId,
        List<UUID> statusIds,
        UUID processoId,
        List<UUID> processoIds,
        UUID baseOperacionalId,
        List<UUID> baseOperacionalIds,
        UUID municipioId,
        List<UUID> municipioIds,
        UUID centroCustoId,
        UUID supervisorId,
        List<UUID> supervisorIds,
        UUID coordenadorId,
        List<UUID> coordenadorIds,
        UUID agenteResponsavelId,
        UUID equipeId,
        UUID projetoRelacionadoId,
        @Deprecated(forRemoval = true) Boolean apenasPrincipais,
        @Deprecated(forRemoval = true) UUID obraPaiId,
        @DateTimeFormat(pattern = "dd/MM/yyyy") LocalDate dataInicioDe,
        @DateTimeFormat(pattern = "dd/MM/yyyy") LocalDate dataInicioAte,
        @DateTimeFormat(pattern = "dd/MM/yyyy") LocalDate dataPrevisaoFimDe,
        @DateTimeFormat(pattern = "dd/MM/yyyy") LocalDate dataPrevisaoFimAte,
        BigDecimal valorProjetoMin,
        BigDecimal valorProjetoMax,
        /** true: só obras com orçamento; false: só obras sem orçamento. */
        Boolean comOrcamento,
        /** true: só obras com algum item acima do orçado (planejado, executado ou medido). */
        Boolean acimaDoOrcado,
        /** Restrição por identificadores, resolvida no servidor (ex.: obras acima do orçado). */
        List<UUID> ids,
        Boolean ativo
) {

    /** Cópia do filtro restrita às obras informadas. */
    public ObraFilter restritoA(List<UUID> restricao) {
        return new ObraFilter(buscaGlobal, numero, titulo, notaObra, tipoObra, tipoObraId, statusId, statusIds, processoId, processoIds, baseOperacionalId, baseOperacionalIds, municipioId, municipioIds, centroCustoId, supervisorId, supervisorIds, coordenadorId, coordenadorIds, agenteResponsavelId, equipeId, projetoRelacionadoId, apenasPrincipais, obraPaiId, dataInicioDe, dataInicioAte, dataPrevisaoFimDe, dataPrevisaoFimAte, valorProjetoMin, valorProjetoMax, comOrcamento, acimaDoOrcado, restricao, ativo);
    }
}
