package com.nexo.app.modules.execucao.infrastructure.persistence;

import com.nexo.app.modules.execucao.domain.ExecucaoMaterial;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface ExecucaoMaterialRepository extends JpaRepository<ExecucaoMaterial, UUID> {

    /** Materiais ativos de notas ativas com uma das séries informadas (já em maiúsculas e sem espaços nas pontas). */
    @Query("SELECT m FROM ExecucaoMaterial m JOIN FETCH m.execucao e "
           + "WHERE m.ativo = true AND e.ativo = true AND UPPER(TRIM(m.numSerie)) IN :series "
           + "ORDER BY e.dataLancamento DESC")
    List<ExecucaoMaterial> buscarPorSeries(@Param("series") Collection<String> series);

    /** Materiais ativos de notas ativas cuja série contém o trecho (padrão LIKE já montado, em maiúsculas). */
    @Query("SELECT m FROM ExecucaoMaterial m JOIN FETCH m.execucao e "
           + "WHERE m.ativo = true AND e.ativo = true AND UPPER(m.numSerie) LIKE :padrao "
           + "ORDER BY e.dataLancamento DESC")
    List<ExecucaoMaterial> buscarPorTrechoDeSerie(@Param("padrao") String padrao, Pageable pageable);
}
