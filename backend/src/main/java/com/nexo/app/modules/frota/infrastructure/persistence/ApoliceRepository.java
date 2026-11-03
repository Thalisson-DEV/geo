package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.Apolice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface ApoliceRepository extends JpaRepository<Apolice, UUID>, JpaSpecificationExecutor<Apolice> {

    List<Apolice> findAllByAtivoTrueAndVigenciaFimLessThanEqual(LocalDate limite);

    List<Apolice> findAllByAtivoTrueAndVigenciaFimBetween(LocalDate de, LocalDate ate);

    boolean existsByIdSeguradoraAndNumeroIgnoreCaseAndAtivoTrueAndIdNot(UUID idSeguradora, String numero, UUID id);

    boolean existsByIdSeguradoraAndNumeroIgnoreCaseAndAtivoTrue(UUID idSeguradora, String numero);

    List<Apolice> findAllByAtivoTrue();

    /** Apólices ativas com algum dos veículos coberto em algum período. */
    @Query("select distinct a from Apolice a join a.coberturas c "
            + "where a.ativo = true and c.ativo = true and c.idVeiculo in :ids")
    List<Apolice> findAllCobrindoVeiculos(@Param("ids") java.util.Collection<UUID> ids);

    /** Apólices ativas com o veículo coberto em algum período. */
    @Query("select distinct a from Apolice a join a.coberturas c "
            + "where a.ativo = true and c.ativo = true and c.idVeiculo = :idVeiculo order by a.vigenciaFim desc")
    List<Apolice> findAllCobrindoVeiculo(@Param("idVeiculo") UUID idVeiculo);
}
