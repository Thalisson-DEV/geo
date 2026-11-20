package com.nexo.app.modules.obras.infrastructure.persistence;

import com.nexo.app.modules.obras.domain.EventoProgramacao;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface EventoProgramacaoRepository
        extends JpaRepository<EventoProgramacao, UUID>, JpaSpecificationExecutor<EventoProgramacao> {

    @org.springframework.data.jpa.repository.Query("""
            select e from EventoProgramacao e
            where (e.idEquipeOrigem = :idEquipe or e.idEquipeDestino = :idEquipe) and e.dataCriacao > :desde
            order by e.dataCriacao asc
            """)
    java.util.List<com.nexo.app.modules.obras.domain.EventoProgramacao> listarDaEquipeDesde(
            @org.springframework.data.repository.query.Param("idEquipe") java.util.UUID idEquipe,
            @org.springframework.data.repository.query.Param("desde") java.time.OffsetDateTime desde);
}
