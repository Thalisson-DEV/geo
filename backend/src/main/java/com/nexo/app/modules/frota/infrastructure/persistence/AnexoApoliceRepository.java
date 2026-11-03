package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.AnexoApolice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface AnexoApoliceRepository extends JpaRepository<AnexoApolice, UUID> {

    List<AnexoApolice> findAllByIdApoliceInAndAtivoTrue(Collection<UUID> idsApolice);
}
