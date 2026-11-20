package com.nexo.app.modules.obras.infrastructure.persistence;

import com.nexo.app.modules.obras.domain.AssinaturaPush;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AssinaturaPushRepository extends JpaRepository<AssinaturaPush, UUID> {

    Optional<AssinaturaPush> findByEndpoint(String endpoint);

    List<AssinaturaPush> findByIdEquipeInAndAtivoTrue(Collection<UUID> idsEquipes);
}
