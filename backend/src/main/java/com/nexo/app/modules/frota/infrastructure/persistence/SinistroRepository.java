package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.Sinistro;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SinistroRepository extends JpaRepository<Sinistro, UUID>, JpaSpecificationExecutor<Sinistro> {

    Optional<Sinistro> findByIdOrdemServico(UUID idOrdemServico);

    List<Sinistro> findAllByIdOrdemServicoIn(Collection<UUID> idsOrdemServico);
}
