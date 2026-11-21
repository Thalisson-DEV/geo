package com.nexo.app.modules.obras.infrastructure.persistence;

import com.nexo.app.modules.obras.domain.PresencaObra;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PresencaObraRepository extends JpaRepository<PresencaObra, UUID> {

    Optional<PresencaObra> findByCampoIdLocal(UUID idLocal);

    List<PresencaObra> findByIdTurnoAndAtivoTrueOrderByCampoDataOrigemAsc(UUID idTurno);

    List<PresencaObra> findByIdTurnoInAndAtivoTrueOrderByCampoDataOrigemAsc(Collection<UUID> idsTurnos);

    List<PresencaObra> findByIdEquipeInAndCampoDataOrigemGreaterThanEqualAndAtivoTrueOrderByCampoDataOrigemAsc(
            Collection<UUID> idsEquipes, OffsetDateTime desde);
}
