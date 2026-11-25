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

    /** Solicitações geradas por uma programação de obra. */
    List<SolicitacaoMaterial> findAllByIdProgramacaoAndAtivoTrue(UUID idProgramacao);

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

    /** Retiradas abertas de um almoxarifado até a data (balcão): adições técnicas aprovadas ou parciais, com equipe. */
    @Query("""
            select distinct s from SolicitacaoMaterial s
            left join fetch s.itens i
            left join fetch i.material
            where s.contexto = com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial.TECNICO
              and s.tipoTecnico in (com.nexo.app.modules.estoque.domain.TipoSolicitacaoTecnica.ADICAO_COMUM,
                                    com.nexo.app.modules.estoque.domain.TipoSolicitacaoTecnica.ADICAO_CONCRETO)
              and s.status in (com.nexo.app.modules.estoque.domain.SolicitacaoMaterial.StatusSolicitacao.APROVADO,
                               com.nexo.app.modules.estoque.domain.SolicitacaoMaterial.StatusSolicitacao.ENTREGUE_PARCIAL)
              and s.encerradaEm is null and s.canceladaEm is null and s.ativo = true
              and s.almoxarifadoAtendimento.id = :idAlmoxarifado
              and s.idEquipeSaque is not null
              and s.dataPrevistaRetirada is not null and s.dataPrevistaRetirada <= :ate
            """)
    List<SolicitacaoMaterial> retiradasAbertasDoBalcao(@Param("idAlmoxarifado") UUID idAlmoxarifado,
                                                      @Param("ate") java.time.LocalDate ate);
}
