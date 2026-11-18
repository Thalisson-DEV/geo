package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.domain.ConciliacaoSerieAplicada;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface ConciliacaoSerieAplicadaRepository extends JpaRepository<ConciliacaoSerieAplicada, UUID> {

    boolean existsByAplicacaoIdAndAtivoTrue(UUID idMovimentacaoAplicacao);

    /** Aplicações da série já casadas com uma série do caminhão (que saiu da equipe). */
    @Query("""
            SELECT count(c) FROM ConciliacaoSerieAplicada c
            WHERE c.estoque.id = :idEstoque AND c.material.id = :idMaterial
              AND c.numSerieAplicada = :numSerie AND c.numSerieBaixada IS NOT NULL AND c.ativo = true
            """)
    long contarCasadas(@Param("idEstoque") UUID idEstoque,
                       @Param("idMaterial") UUID idMaterial,
                       @Param("numSerie") String numSerie);
}
