package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.ModeloChecklist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.UUID;

public interface ModeloChecklistRepository extends JpaRepository<ModeloChecklist, UUID>, JpaSpecificationExecutor<ModeloChecklist> {

    boolean existsByNomeIgnoreCase(String nome);

    boolean existsByNomeIgnoreCaseAndIdNot(String nome, UUID id);

    List<ModeloChecklist> findAllByAtivoTrue();
}
