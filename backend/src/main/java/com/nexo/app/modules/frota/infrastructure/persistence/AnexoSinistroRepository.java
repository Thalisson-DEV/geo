package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.AnexoSinistro;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface AnexoSinistroRepository extends JpaRepository<AnexoSinistro, UUID> {

    List<AnexoSinistro> findAllByIdSinistroInAndAtivoTrue(Collection<UUID> idsSinistro);
}
