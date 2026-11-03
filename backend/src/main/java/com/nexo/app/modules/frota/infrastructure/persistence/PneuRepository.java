package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.Pneu;
import com.nexo.app.modules.frota.domain.SituacaoPneu;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PneuRepository extends JpaRepository<Pneu, UUID>, JpaSpecificationExecutor<Pneu> {

    List<Pneu> findAllByIdVeiculoAndAtivoTrue(UUID idVeiculo);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Pneu p where p.id in :ids")
    List<Pneu> findAllWithLockByIdIn(@Param("ids") Collection<UUID> ids);

    @Query("""
            select (count(p) > 0) from Pneu p
            where p.ativo = true and p.situacao <> com.nexo.app.modules.frota.domain.SituacaoPneu.DESCARTADO
              and upper(p.marcaFogo) = upper(:marcaFogo) and (:id is null or p.id <> :id)
            """)
    boolean existsMarcaFogoEmUso(@Param("marcaFogo") String marcaFogo, @Param("id") UUID id);

    Optional<Pneu> findByReferenciaExternaSistemaOrigemAndReferenciaExternaIdExterno(String sistemaOrigem, String idExterno);

    long countBySituacaoAndAtivoTrue(SituacaoPneu situacao);

    @Query("select distinct p.marca from Pneu p where p.ativo = true order by p.marca")
    List<String> marcas();
}
