package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.SubtipoDespesa;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface SubtipoDespesaRepository extends JpaRepository<SubtipoDespesa, UUID> {
}
