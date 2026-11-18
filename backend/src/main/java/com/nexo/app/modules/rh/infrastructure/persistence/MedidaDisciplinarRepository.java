package com.nexo.app.modules.rh.infrastructure.persistence;

import com.nexo.app.modules.rh.domain.MedidaDisciplinar;
import com.nexo.app.modules.rh.domain.SituacaoMedidaDisciplinar;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface MedidaDisciplinarRepository extends JpaRepository<MedidaDisciplinar, UUID>, JpaSpecificationExecutor<MedidaDisciplinar> {

    /** Medidas do colaborador e do motivo com fato desde a data, para a reincidência. */
    @EntityGraph(attributePaths = {"tipo", "motivo"})
    @Query("""
            SELECT m FROM MedidaDisciplinar m
            WHERE m.idColaborador = :idColaborador AND m.motivo.id = :idMotivo
              AND m.dataFato >= :desde AND m.situacao IN :situacoes
            ORDER BY m.dataFato DESC, m.dataCriacao DESC
            """)
    List<MedidaDisciplinar> anteriores(@Param("idColaborador") UUID idColaborador, @Param("idMotivo") UUID idMotivo,
                                       @Param("desde") LocalDate desde,
                                       @Param("situacoes") Collection<SituacaoMedidaDisciplinar> situacoes);

    @EntityGraph(attributePaths = {"tipo", "motivo"})
    List<MedidaDisciplinar> findAllByIdIn(Collection<UUID> ids);
}
