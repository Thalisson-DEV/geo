package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import com.nexo.app.modules.frota.domain.RastreadorTelemetria;
import com.nexo.app.modules.frota.domain.SituacaoRastreador;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface RastreadorTelemetriaRepository extends JpaRepository<RastreadorTelemetria, UUID>,
        JpaSpecificationExecutor<RastreadorTelemetria> {

    List<RastreadorTelemetria> findAllByProvedorAndAtivoTrue(ProvedorTelemetria provedor);

    List<RastreadorTelemetria> findAllByProvedorAndSituacaoAndAtivoTrue(ProvedorTelemetria provedor, SituacaoRastreador situacao);

    List<RastreadorTelemetria> findAllByIdVeiculoAndAtivoTrueOrderByUltimaComunicacaoDesc(UUID idVeiculo);

    List<RastreadorTelemetria> findAllByIdVeiculoInAndAtivoTrue(Collection<UUID> idsVeiculo);

    List<RastreadorTelemetria> findAllBySituacaoAndAtivoTrue(SituacaoRastreador situacao);

    long countBySituacaoAndAtivoTrue(SituacaoRastreador situacao);

    @Query("""
            select count(r) from RastreadorTelemetria r
            where r.ativo = true and r.situacao = com.nexo.app.modules.frota.domain.SituacaoRastreador.VINCULADO
              and (r.ultimaComunicacao is null or r.ultimaComunicacao < :limite)
            """)
    long contarVinculadosSemComunicacaoDesde(OffsetDateTime limite);
}
