package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.Saldo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface SaldoRepository extends JpaRepository<Saldo, UUID>, JpaSpecificationExecutor<Saldo> {
    Optional<Saldo> findFirstByAtivoTrueOrderByIdAsc();
    Optional<Saldo> findByEstoqueIdAndMaterialIdAndCondicao(UUID estoqueId, UUID materialId, CondicaoMaterial condicao);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select saldo from Saldo saldo
            where saldo.estoque.id = :estoqueId
              and saldo.material.id = :materialId
              and saldo.condicao = :condicao
            """)
    Optional<Saldo> findWithLockByEstoqueIdAndMaterialIdAndCondicao(
            @Param("estoqueId") UUID estoqueId,
            @Param("materialId") UUID materialId,
            @Param("condicao") CondicaoMaterial condicao);

    @Query("""
            select (count(saldo) > 0) from Saldo saldo
            where saldo.estoque.id = :estoqueId
              and saldo.ativo = true
              and saldo.quantidade > 0
            """)
    boolean existsSaldoPositivoByEstoqueId(@Param("estoqueId") UUID estoqueId);

    @Query("""
            select saldo from Saldo saldo
            join fetch saldo.material material
            where saldo.estoque.id = :estoqueId
              and saldo.ativo = true
              and saldo.quantidade <> 0
            order by material.codigo, saldo.condicao
            """)
    java.util.List<Saldo> findDiferentesDeZeroByEstoqueId(@Param("estoqueId") UUID estoqueId);

    boolean existsByEstoqueIdAndMaterialIdAndCondicao(UUID estoqueId, UUID materialId, CondicaoMaterial condicao);

    /** Saldos ativos dos almoxarifados de um tipo (ex.: FROTA), com estoque e material carregados. */
    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = {"estoque", "material"})
    java.util.List<Saldo> findAllByEstoqueTipoEstoqueNomeAndAtivoTrue(String tipo);

    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = {"estoque", "material"})
    java.util.List<Saldo> findAllByEstoqueIdAndAtivoTrue(UUID estoqueId);

    @Query("""
            select (count(saldo) > 0) from Saldo saldo
            where saldo.material.id = :materialId
              and saldo.ativo = true
              and saldo.quantidade <> 0
            """)
    boolean existsSaldoNaoZeradoByMaterialId(@Param("materialId") UUID materialId);
}
