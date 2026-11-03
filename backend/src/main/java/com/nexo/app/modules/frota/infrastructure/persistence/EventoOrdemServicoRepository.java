package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.EventoOrdemServico;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EventoOrdemServicoRepository extends JpaRepository<EventoOrdemServico, UUID> {

    List<EventoOrdemServico> findAllByIdOrdemServicoOrderByOcorridoEmAscDataCriacaoAsc(UUID idOrdemServico);
}
