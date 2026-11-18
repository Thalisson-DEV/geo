package com.nexo.app.modules.obras.infrastructure.persistence;

import com.nexo.app.modules.obras.domain.EvidenciaVisitaPrevia;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EvidenciaVisitaPreviaRepository extends JpaRepository<EvidenciaVisitaPrevia, UUID> {

    List<EvidenciaVisitaPrevia> findByIdVisitaInAndAtivoTrueOrderByDataCriacaoAsc(Collection<UUID> idsVisitas);

    List<EvidenciaVisitaPrevia> findByIdVisitaAndAtivoTrueOrderByDataCriacaoAsc(UUID idVisita);

    Optional<EvidenciaVisitaPrevia> findByIdAndIdVisitaAndIdObraAndAtivoTrue(UUID id, UUID idVisita, UUID idObra);

    long countByIdVisitaAndAtivoTrue(UUID idVisita);
}
