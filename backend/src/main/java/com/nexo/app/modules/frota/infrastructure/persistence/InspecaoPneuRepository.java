package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.InspecaoPneu;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;
import java.util.UUID;

public interface InspecaoPneuRepository extends JpaRepository<InspecaoPneu, UUID>, JpaSpecificationExecutor<InspecaoPneu> {

    @EntityGraph(attributePaths = "itens")
    Optional<InspecaoPneu> findFirstByIdVeiculoAndAtivoTrueOrderByRealizadaEmDesc(UUID idVeiculo);

    @EntityGraph(attributePaths = "itens")
    Page<InspecaoPneu> findAll(org.springframework.data.jpa.domain.Specification<InspecaoPneu> spec, Pageable pageable);
}
