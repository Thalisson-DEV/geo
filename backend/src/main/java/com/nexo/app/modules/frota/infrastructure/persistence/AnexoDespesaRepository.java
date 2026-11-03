package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.AnexoDespesa;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface AnexoDespesaRepository extends JpaRepository<AnexoDespesa, UUID> {

    List<AnexoDespesa> findAllByIdDespesaAndAtivoTrueOrderByDataCriacaoAsc(UUID idDespesa);

    List<AnexoDespesa> findAllByIdDespesaInAndAtivoTrue(Collection<UUID> idsDespesa);
}
