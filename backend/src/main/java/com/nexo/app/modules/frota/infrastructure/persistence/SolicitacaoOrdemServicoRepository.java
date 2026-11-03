package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.SolicitacaoOrdemServico;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SolicitacaoOrdemServicoRepository extends JpaRepository<SolicitacaoOrdemServico, UUID> {

    Optional<SolicitacaoOrdemServico> findByIdSolicitacao(UUID idSolicitacao);

    List<SolicitacaoOrdemServico> findAllByIdOrdemServicoInAndAtivoTrue(Collection<UUID> idsOrdemServico);

    List<SolicitacaoOrdemServico> findAllByIdOrdemServicoAndAtivoTrueOrderByDataCriacaoAsc(UUID idOrdemServico);
}
