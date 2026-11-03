package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.FaturaPosto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface FaturaPostoRepository extends JpaRepository<FaturaPosto, UUID> {

    boolean existsByPostoIdAndNumeroIgnoreCaseAndAtivoTrue(UUID idPosto, String numero);

    @Query("select f from FaturaPosto f where f.ativo = true and (:idPosto is null or f.posto.id = :idPosto) "
            + "and (:situacao is null or f.situacao = :situacao)")
    Page<FaturaPosto> listar(@Param("idPosto") UUID idPosto, @Param("situacao") FaturaPosto.Situacao situacao, Pageable pageable);
}
