package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.domain.AtendimentoBalcao;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface AtendimentoBalcaoRepository extends JpaRepository<AtendimentoBalcao, UUID> {

    @Query("""
            select a from AtendimentoBalcao a
            where a.idAlmoxarifado = :idAlmoxarifado and a.realizadoEm >= :desde and a.ativo = true
            order by a.realizadoEm desc
            """)
    List<AtendimentoBalcao> doAlmoxarifadoDesde(UUID idAlmoxarifado, OffsetDateTime desde);

    @Query("""
            select a from AtendimentoBalcao a
            where a.idEquipe = :idEquipe and a.ativo = true
            order by a.realizadoEm desc
            """)
    List<AtendimentoBalcao> recentesDaEquipe(UUID idEquipe, Pageable pagina);
}
