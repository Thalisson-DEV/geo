package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.DocumentoFiscalOrdemServico;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DocumentoFiscalOrdemServicoRepository extends JpaRepository<DocumentoFiscalOrdemServico, UUID> {

    List<DocumentoFiscalOrdemServico> findAllByIdOrdemServicoAndAtivoTrueOrderByEmitidoEmAscDataCriacaoAsc(UUID idOrdemServico);
}
