package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.AlvoAnaliseIa;
import com.nexo.app.modules.frota.domain.AnaliseIaFrota;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AnaliseIaFrotaRepository extends JpaRepository<AnaliseIaFrota, UUID> {

    Optional<AnaliseIaFrota> findFirstByAlvoAndIdAlvoAndAtivoTrueOrderByDataCriacaoDesc(AlvoAnaliseIa alvo, UUID idAlvo);
}
