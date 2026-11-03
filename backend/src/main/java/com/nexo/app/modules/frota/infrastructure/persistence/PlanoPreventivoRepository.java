package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.PlanoPreventivo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.UUID;

public interface PlanoPreventivoRepository extends JpaRepository<PlanoPreventivo, UUID>, JpaSpecificationExecutor<PlanoPreventivo> {

    boolean existsByNomeIgnoreCase(String nome);

    boolean existsByNomeIgnoreCaseAndIdNot(String nome, UUID id);

    List<PlanoPreventivo> findAllByAtivoTrue();

    List<PlanoPreventivo> findAllByOrderByNomeAsc();
}
