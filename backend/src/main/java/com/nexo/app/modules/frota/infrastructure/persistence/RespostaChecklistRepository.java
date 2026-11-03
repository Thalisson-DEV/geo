package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.RespostaChecklist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface RespostaChecklistRepository extends JpaRepository<RespostaChecklist, UUID> {

    /** Respostas das perguntas no veículo até o instante, da mais recente para a mais antiga (histórico do item). */
    @Query("""
            SELECT r.pergunta.id AS idPergunta, c.preenchidoEm AS preenchidoEm, r.problema AS problema
              FROM RespostaChecklist r JOIN r.checklist c
             WHERE c.idVeiculo = :idVeiculo AND c.ativo = true AND r.ativo = true
               AND r.pergunta.id IN :idsPergunta AND c.preenchidoEm <= :ate
             ORDER BY c.preenchidoEm DESC
            """)
    List<OcorrenciaProjection> historico(@Param("idVeiculo") UUID idVeiculo,
                                         @Param("idsPergunta") Collection<UUID> idsPergunta,
                                         @Param("ate") OffsetDateTime ate);

    interface OcorrenciaProjection {
        UUID getIdPergunta();

        OffsetDateTime getPreenchidoEm();

        Boolean getProblema();
    }
}
