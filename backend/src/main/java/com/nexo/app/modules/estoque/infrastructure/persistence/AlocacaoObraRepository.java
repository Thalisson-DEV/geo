package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.domain.AlocacaoObra;
import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AlocacaoObraRepository extends JpaRepository<AlocacaoObra, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select a from AlocacaoObra a
            where a.estoque.id = :idEstoque and a.material.id = :idMaterial
              and a.condicao = :condicao and a.idObra = :idObra
            """)
    Optional<AlocacaoObra> buscarComLock(@Param("idEstoque") UUID idEstoque, @Param("idMaterial") UUID idMaterial,
                                         @Param("condicao") CondicaoMaterial condicao, @Param("idObra") UUID idObra);

    /** Alocações do material no local, de todas as obras, com lock e a maior primeiro. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select a from AlocacaoObra a
            where a.estoque.id = :idEstoque and a.material.id = :idMaterial
              and a.condicao = :condicao and a.quantidade > 0
            order by a.quantidade desc, a.dataCriacao
            """)
    List<AlocacaoObra> listarDoMaterialComLock(@Param("idEstoque") UUID idEstoque, @Param("idMaterial") UUID idMaterial,
                                              @Param("condicao") CondicaoMaterial condicao);

    @EntityGraph(attributePaths = {"estoque", "estoque.tipoEstoque", "material"})
    @Query("select a from AlocacaoObra a where a.idObra = :idObra and a.quantidade > 0")
    List<AlocacaoObra> listarDaObra(@Param("idObra") UUID idObra);

    @EntityGraph(attributePaths = {"material"})
    @Query("select a from AlocacaoObra a where a.estoque.id = :idEstoque and a.quantidade > 0")
    List<AlocacaoObra> listarDoLocal(@Param("idEstoque") UUID idEstoque);
}
