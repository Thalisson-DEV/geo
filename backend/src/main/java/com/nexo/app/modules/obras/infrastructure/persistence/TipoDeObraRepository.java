package com.nexo.app.modules.obras.infrastructure.persistence;

import com.nexo.app.modules.obras.domain.TipoDeObra;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface TipoDeObraRepository extends JpaRepository<TipoDeObra, UUID>, JpaSpecificationExecutor<TipoDeObra> {

    Optional<TipoDeObra> findByCodigo(String codigo);

    Optional<TipoDeObra> findByNomeIgnoreCase(String nome);

    boolean existsByNomeIgnoreCase(String nome);

    boolean existsByNomeIgnoreCaseAndIdNot(String nome, UUID id);

    boolean existsByCodigo(String codigo);
}
