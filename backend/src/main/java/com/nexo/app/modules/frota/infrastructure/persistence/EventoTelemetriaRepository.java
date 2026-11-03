package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.EventoTelemetria;
import com.nexo.app.modules.frota.domain.ProvedorTelemetria;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface EventoTelemetriaRepository extends JpaRepository<EventoTelemetria, UUID>, JpaSpecificationExecutor<EventoTelemetria> {

    @Query("select e.idExterno from EventoTelemetria e where e.provedor = :provedor and e.idExterno in :ids")
    List<String> idsExternosExistentes(ProvedorTelemetria provedor, Collection<String> ids);

    List<EventoTelemetria> findTop10ByIdVeiculoAndAtivoTrueOrderByOcorridoEmDesc(UUID idVeiculo);

    long countByOcorridoEmGreaterThanEqualAndAtivoTrue(OffsetDateTime desde);

    interface ContagemTipo {
        com.nexo.app.modules.frota.domain.TipoEventoTelemetria getTipo();

        long getTotal();
    }

    interface ContagemVeiculo {
        UUID getIdVeiculo();

        long getTotal();
    }

    @Query("select e.idVeiculo as idVeiculo, count(e) as total from EventoTelemetria e "
            + "where e.ativo = true and e.idVeiculo is not null and e.ocorridoEm >= :desde group by e.idVeiculo")
    List<ContagemVeiculo> contarPorVeiculoDesde(OffsetDateTime desde);

    @Query("""
            select e.tipo as tipo, count(e) as total from EventoTelemetria e
            where e.ativo = true and e.idVeiculo = :idVeiculo and e.ocorridoEm >= :desde
            group by e.tipo
            """)
    List<ContagemTipo> contarPorTipoDoVeiculo(UUID idVeiculo, OffsetDateTime desde);
}
