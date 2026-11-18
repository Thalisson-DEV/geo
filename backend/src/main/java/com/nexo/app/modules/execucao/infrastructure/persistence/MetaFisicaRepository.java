package com.nexo.app.modules.execucao.infrastructure.persistence;

import com.nexo.app.modules.execucao.domain.MetaFisica;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface MetaFisicaRepository extends JpaRepository<MetaFisica, UUID>, JpaSpecificationExecutor<MetaFisica> {

    List<MetaFisica> findByAtivoTrueAndIdBaseOperacionalAndCompetencia(UUID idBaseOperacional, LocalDate competencia);

    @EntityGraph(attributePaths = "itens")
    List<MetaFisica> findByAtivoTrueAndCompetenciaBetween(LocalDate de, LocalDate ate);
}
