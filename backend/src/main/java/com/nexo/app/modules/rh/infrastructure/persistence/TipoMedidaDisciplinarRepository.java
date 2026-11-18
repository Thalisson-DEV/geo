package com.nexo.app.modules.rh.infrastructure.persistence;

import com.nexo.app.modules.rh.domain.TipoMedidaDisciplinar;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface TipoMedidaDisciplinarRepository extends JpaRepository<TipoMedidaDisciplinar, UUID> {

    List<TipoMedidaDisciplinar> findAllByOrderByGravidadeAscNomeAsc();

    boolean existsByNomeIgnoreCase(String nome);

    boolean existsByNomeIgnoreCaseAndIdNot(String nome, UUID id);
}
