package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.AvisoPostoAbastecimento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface AvisoPostoAbastecimentoRepository extends JpaRepository<AvisoPostoAbastecimento, UUID> {

    List<AvisoPostoAbastecimento> findAllByIdAbastecimentoOrderByDataCriacaoAsc(UUID idAbastecimento);

    List<AvisoPostoAbastecimento> findAllByIdAbastecimentoIn(Collection<UUID> idsAbastecimento);
}
