package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.AnexoOrdemServico;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AnexoOrdemServicoRepository extends JpaRepository<AnexoOrdemServico, UUID> {

    List<AnexoOrdemServico> findAllByIdOrdemServicoAndAtivoTrueOrderByDataCriacaoAsc(UUID idOrdemServico);
}
