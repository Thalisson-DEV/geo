package com.nexo.app.modules.obras.infrastructure.persistence;

import com.nexo.app.modules.obras.domain.VisitaPreviaObra;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface VisitaPreviaObraRepository extends JpaRepository<VisitaPreviaObra, UUID> {

    List<VisitaPreviaObra> findByIdObraAndAtivoTrueOrderByDataVisitaDescDataCriacaoDesc(UUID idObra);

    Optional<VisitaPreviaObra> findByIdAndIdObraAndAtivoTrue(UUID id, UUID idObra);

    boolean existsByIdModelo(UUID idModelo);

    @Query("select distinct v.idObra from VisitaPreviaObra v where v.ativo = true and v.idObra in :obras and v.dataUltimaAlteracao > :desde")
    List<UUID> obrasComVisitaDesde(@Param("obras") Collection<UUID> obras, @Param("desde") OffsetDateTime desde);
}
