package com.nexo.app.modules.sst.infrastructure.persistence;

import com.nexo.app.modules.sst.domain.ModeloApr;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ModeloAprRepository extends JpaRepository<ModeloApr, UUID> {

    /** O cadastro único da implantação (o mais antigo ativo, se por acaso houver mais de um). */
    Optional<ModeloApr> findFirstByAtivoTrueOrderByDataCriacaoAsc();
}
