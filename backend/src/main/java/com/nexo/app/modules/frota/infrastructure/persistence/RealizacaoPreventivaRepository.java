package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.RealizacaoPreventiva;
import com.nexo.app.modules.frota.domain.SituacaoRealizacaoPreventiva;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface RealizacaoPreventivaRepository extends JpaRepository<RealizacaoPreventiva, UUID> {

    @EntityGraph(attributePaths = {"controle", "controle.plano"})
    List<RealizacaoPreventiva> findAllByIdOrdemServicoAndAtivoTrue(UUID idOrdemServico);

    @EntityGraph(attributePaths = {"controle", "controle.plano"})
    List<RealizacaoPreventiva> findAllByIdOrdemServicoAndSituacaoAndAtivoTrue(UUID idOrdemServico,
                                                                              SituacaoRealizacaoPreventiva situacao);

    @EntityGraph(attributePaths = {"controle", "controle.plano"})
    List<RealizacaoPreventiva> findAllByControleIdInAndAtivoTrueOrderByDataCriacaoDesc(Collection<UUID> idsControle);

    List<RealizacaoPreventiva> findAllByIdIn(Collection<UUID> ids);
}
