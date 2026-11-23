package com.nexo.app.modules.obras.infrastructure.persistence;

import com.nexo.app.modules.obras.domain.RevisaoOrcamentoObra;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RevisaoOrcamentoObraRepository extends JpaRepository<RevisaoOrcamentoObra, UUID> {

    Optional<RevisaoOrcamentoObra> findFirstByIdObraAndAtivoTrueOrderByNumeroDesc(UUID idObra);

    List<RevisaoOrcamentoObra> findByIdObraAndAtivoTrueOrderByNumeroDesc(UUID idObra);

    /** Obras do recorte que já têm orçamento. */
    @Query("select distinct r.idObra from RevisaoOrcamentoObra r where r.ativo = true and r.idObra in :ids")
    List<UUID> obrasComOrcamento(@Param("ids") Collection<UUID> ids);
}
