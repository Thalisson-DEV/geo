package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.EventoPneu;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface EventoPneuRepository extends JpaRepository<EventoPneu, UUID>, JpaSpecificationExecutor<EventoPneu> {

    List<EventoPneu> findAllByIdPneuOrderByOcorridoEmDescDataCriacaoDesc(UUID idPneu);

    List<EventoPneu> findAllByIdPneuIn(Collection<UUID> idsPneu);
}
