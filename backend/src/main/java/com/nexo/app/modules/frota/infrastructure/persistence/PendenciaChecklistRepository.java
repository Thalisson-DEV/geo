package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.PendenciaChecklist;
import com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface PendenciaChecklistRepository extends JpaRepository<PendenciaChecklist, UUID>, JpaSpecificationExecutor<PendenciaChecklist> {

    List<PendenciaChecklist> findAllByIdChecklist(UUID idChecklist);

    List<PendenciaChecklist> findAllByIdOrdemServico(UUID idOrdemServico);

    List<PendenciaChecklist> findAllByIdVeiculoInAndSituacaoAndAtivoTrue(Collection<UUID> idsVeiculo,
                                                                        SituacaoPendenciaChecklist situacao);

    List<PendenciaChecklist> findAllByIdVeiculoAndSituacaoInAndAtivoTrueOrderByDataCriacaoDesc(
            UUID idVeiculo, Collection<SituacaoPendenciaChecklist> situacoes);

    /** Já existe pendência em aberto (sem decisão ou com OS em andamento) para o item no veículo? */
    @Query("""
            SELECT COUNT(p) > 0 FROM PendenciaChecklist p
             WHERE p.ativo = true AND p.idVeiculo = :idVeiculo AND p.resposta.pergunta.id = :idPergunta
               AND p.situacao IN (com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist.ABERTA,
                                  com.nexo.app.modules.frota.domain.SituacaoPendenciaChecklist.OS_ABERTA)
            """)
    boolean existeEmAberto(@Param("idVeiculo") UUID idVeiculo, @Param("idPergunta") UUID idPergunta);
}
