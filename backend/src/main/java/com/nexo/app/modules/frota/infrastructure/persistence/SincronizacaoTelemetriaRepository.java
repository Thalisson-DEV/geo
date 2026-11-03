package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import com.nexo.app.modules.frota.domain.RotinaTelemetria;
import com.nexo.app.modules.frota.domain.SincronizacaoTelemetria;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SincronizacaoTelemetriaRepository extends JpaRepository<SincronizacaoTelemetria, UUID> {

    Optional<SincronizacaoTelemetria> findByProvedorAndRotina(ProvedorTelemetria provedor, RotinaTelemetria rotina);
}
