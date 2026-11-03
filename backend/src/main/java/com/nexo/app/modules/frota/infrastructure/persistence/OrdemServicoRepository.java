package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface OrdemServicoRepository extends JpaRepository<OrdemServico, UUID>, JpaSpecificationExecutor<OrdemServico> {

    /** OS abertas do veículo que mantêm uma parada em curso, fora a informada. */
    @Query("""
            select count(o) > 0 from OrdemServico o
            where o.idVeiculo = :idVeiculo and o.id <> :idIgnorar and o.ativo = true
              and o.veiculoParado = true and o.liberadoEm is null and o.situacao in :abertas
            """)
    boolean existeOutraParadaEmCurso(@Param("idVeiculo") UUID idVeiculo,
                                     @Param("idIgnorar") UUID idIgnorar,
                                     @Param("abertas") Collection<SituacaoOrdemServico> abertas);

    List<OrdemServico> findAllBySituacaoAndPrevisaoTerminoBeforeAndAtivoTrue(SituacaoOrdemServico situacao,
                                                                             OffsetDateTime limite);

    List<OrdemServico> findAllBySituacaoAndAgendadaParaBetweenAndAtivoTrue(SituacaoOrdemServico situacao,
                                                                         OffsetDateTime de, OffsetDateTime ate);

    List<OrdemServico> findAllBySituacaoAndPrevisaoTerminoBetweenAndAtivoTrue(SituacaoOrdemServico situacao,
                                                                            OffsetDateTime de, OffsetDateTime ate);

    List<OrdemServico> findAllByIdVeiculoInAndSituacaoInAndAtivoTrue(Collection<UUID> idsVeiculo,
                                                                    Collection<SituacaoOrdemServico> situacoes);

    List<OrdemServico> findAllByIdVeiculoAndSituacaoInAndAtivoTrueOrderByAbertaEmDesc(UUID idVeiculo,
                                                                                    Collection<SituacaoOrdemServico> situacoes);

    List<OrdemServico> findTop5ByIdVeiculoAndSituacaoAndAtivoTrueOrderByFimRealDesc(UUID idVeiculo,
                                                                                  SituacaoOrdemServico situacao);

    /** Preventivas concluídas dos veículos com os itens: base de um controle preventivo novo. */
    @Query("""
            select o.idVeiculo as idVeiculo, o.id as idOrdemServico, o.fimReal as fimReal,
                   o.kmEncerramento as kmEncerramento, o.kmAbertura as kmAbertura,
                   o.unidadeMedicao as unidade, i.item.id as idItem
              from OrdemServico o join o.itens i
             where o.idVeiculo in :idsVeiculo and o.ativo = true
               and o.tipoManutencao = com.nexo.app.modules.frota.domain.TipoManutencao.PREVENTIVA
               and o.situacao = com.nexo.app.modules.frota.domain.SituacaoOrdemServico.CONCLUIDA
            """)
    List<PreventivaConcluidaProjection> buscarPreventivasConcluidas(@Param("idsVeiculo") Collection<UUID> idsVeiculo);

    interface PreventivaConcluidaProjection {
        UUID getIdVeiculo();

        UUID getIdOrdemServico();

        OffsetDateTime getFimReal();

        Long getKmEncerramento();

        Long getKmAbertura();

        com.nexo.app.modules.frota.domain.UnidadeMedicao getUnidade();

        UUID getIdItem();
    }

    /**
     * Corretivas concluídas no período por item de manutenção: quantas OS, em quantos veículos,
     * a soma do valor das OS e a mais recente. Base da revisão dos planos preventivos.
     */
    @Query("""
            select i.item.id as idItem, i.item.nome as item, count(distinct o.id) as ordens,
                   count(distinct o.idVeiculo) as veiculos, sum(coalesce(o.valorTotal, 0)) as valor,
                   max(o.fimReal) as ultima
              from OrdemServico o join o.itens i
             where o.ativo = true and o.veicular = true
               and o.tipoManutencao = com.nexo.app.modules.frota.domain.TipoManutencao.CORRETIVA
               and o.situacao = com.nexo.app.modules.frota.domain.SituacaoOrdemServico.CONCLUIDA
               and o.fimReal >= :de and o.fimReal < :ate
               and (:todasBases = true or o.idBaseOperacional in :idsBase)
               and (:todosTipos = true or exists (
                    select 1 from FichaVeiculo f where f.idVeiculo = o.idVeiculo and f.tipoVeiculo.id in :idsTipo))
             group by i.item.id, i.item.nome
             order by count(distinct o.id) desc, i.item.nome asc
            """)
    List<CorretivaPorItemProjection> contarCorretivasPorItem(@Param("de") OffsetDateTime de,
                                                            @Param("ate") OffsetDateTime ate,
                                                            @Param("todasBases") boolean todasBases,
                                                            @Param("idsBase") Collection<UUID> idsBase,
                                                            @Param("todosTipos") boolean todosTipos,
                                                            @Param("idsTipo") Collection<UUID> idsTipo);

    interface CorretivaPorItemProjection {
        UUID getIdItem();

        String getItem();

        Long getOrdens();

        Long getVeiculos();

        java.math.BigDecimal getValor();

        OffsetDateTime getUltima();
    }
}
