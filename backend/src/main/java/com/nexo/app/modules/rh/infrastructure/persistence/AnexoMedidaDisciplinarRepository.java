package com.nexo.app.modules.rh.infrastructure.persistence;

import com.nexo.app.modules.rh.domain.AnexoMedidaDisciplinar;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface AnexoMedidaDisciplinarRepository extends JpaRepository<AnexoMedidaDisciplinar, UUID> {

    List<AnexoMedidaDisciplinar> findAllByIdMedidaAndAtivoTrueOrderByDataCriacaoAsc(UUID idMedida);

    List<AnexoMedidaDisciplinar> findAllByIdMedidaInAndAtivoTrue(Collection<UUID> idsMedida);
}
