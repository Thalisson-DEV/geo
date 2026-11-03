package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.TipoDespesa;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TipoDespesaRepository extends JpaRepository<TipoDespesa, UUID> {

    List<TipoDespesa> findAllByOrderByOrdemAscNomeAsc();

    boolean existsByNomeIgnoreCase(String nome);

    boolean existsByNomeIgnoreCaseAndIdNot(String nome, UUID id);

    Optional<TipoDespesa> findByCodigo(String codigo);

    Optional<TipoDespesa> findFirstByNomeIgnoreCase(String nome);
}
