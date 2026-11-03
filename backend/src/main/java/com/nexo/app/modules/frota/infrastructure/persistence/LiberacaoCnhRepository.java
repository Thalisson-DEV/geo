package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.LiberacaoCnh;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LiberacaoCnhRepository extends JpaRepository<LiberacaoCnh, UUID> {

    Optional<LiberacaoCnh> findByIdCondutorAndIdVeiculoAndDiaAndAtivoTrue(UUID idCondutor, UUID idVeiculo, LocalDate dia);

    List<LiberacaoCnh> findAllByDiaAndAtivoTrue(LocalDate dia);

    Page<LiberacaoCnh> findAllByAtivoTrueOrderByDiaDescDataCriacaoDesc(Pageable pageable);
}
