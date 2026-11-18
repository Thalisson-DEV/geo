package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.SolicitacaoMaterial;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface SolicitacaoMaterialRepository extends JpaRepository<SolicitacaoMaterial, UUID>, JpaSpecificationExecutor<SolicitacaoMaterial> {

    List<SolicitacaoMaterial> findAllByStatusAndEncerradaEmIsNullAndDataEntregaBefore(
        SolicitacaoMaterial.StatusSolicitacao status, 
        OffsetDateTime dataEntrega
    );

    boolean existsByIdObraAndContextoAndEncerradaEmIsNullAndStatusIn(
            UUID idObra,
            ContextoSolicitacaoMaterial contexto,
            Collection<SolicitacaoMaterial.StatusSolicitacao> statuses);

    /** [idObra, situacaoFechamento, quantidade] das solicitações de encerramento das obras informadas. */
    @Query("""
            select s.idObra, s.situacaoFechamento, count(s)
            from SolicitacaoMaterial s
            where s.contexto = com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial.FECHAMENTO
              and s.idObra in :idsObras
            group by s.idObra, s.situacaoFechamento
            """)
    List<Object[]> contarSituacoesFechamentoPorObra(@Param("idsObras") Collection<UUID> idsObras);

    @Query("""
            select s.idObra, s.situacaoFechamento, count(s)
            from SolicitacaoMaterial s
            where s.contexto = com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial.FECHAMENTO
            group by s.idObra, s.situacaoFechamento
            """)
    List<Object[]> contarSituacoesFechamentoDeTodasAsObras();

    @Query("""
            select distinct s.idRequisitante
            from SolicitacaoMaterial s
            where s.contexto = com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial.FECHAMENTO
            """)
    List<UUID> listarSolicitantesFechamento();
}
