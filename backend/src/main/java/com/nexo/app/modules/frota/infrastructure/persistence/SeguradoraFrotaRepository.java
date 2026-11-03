package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.PapelSeguradora;
import com.nexo.app.modules.frota.domain.SeguradoraFrota;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface SeguradoraFrotaRepository extends JpaRepository<SeguradoraFrota, UUID> {

    boolean existsByIdFornecedorAndPapelAndAtivoTrue(UUID idFornecedor, PapelSeguradora papel);

    boolean existsByIdFornecedorAndPapelAndAtivoTrueAndIdNot(UUID idFornecedor, PapelSeguradora papel, UUID id);
}
