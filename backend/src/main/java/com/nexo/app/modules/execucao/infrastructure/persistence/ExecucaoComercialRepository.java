package com.nexo.app.modules.execucao.infrastructure.persistence;

import com.nexo.app.modules.execucao.application.dto.LancamentoResumido;
import com.nexo.app.modules.execucao.application.dto.ProducaoDoTurno;
import com.nexo.app.modules.execucao.application.dto.UltimoLancamentoDoTurno;
import com.nexo.app.modules.execucao.domain.ExecucaoComercial;
import com.nexo.app.modules.execucao.domain.StatusExecucao;
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
public interface ExecucaoComercialRepository extends JpaRepository<ExecucaoComercial, UUID>, JpaSpecificationExecutor<ExecucaoComercial> {
    java.util.Optional<ExecucaoComercial> findFirstByAtivoTrueOrderByIdAsc();

    /** Número da nota de cada execução; o conversor da entidade abre o valor cifrado. */
    @Query("SELECT new com.nexo.app.modules.execucao.application.dto.NumeroDaNota(e.id, e.referenciaNota) "
           + "FROM ExecucaoComercial e WHERE e.id IN :ids")
    List<com.nexo.app.modules.execucao.application.dto.NumeroDaNota> buscarNumeros(@Param("ids") Collection<UUID> ids);

    @Query("SELECT new com.nexo.app.modules.execucao.application.dto.LancamentoResumido("
           + "e.id, e.idEquipe, e.idTurno, e.idTipoServico, e.dataLancamento, e.valorTotalFaturado) "
           + "FROM ExecucaoComercial e "
           + "WHERE e.ativo = true AND e.statusExecucao = :status "
           + "AND e.dataLancamento >= :inicio AND e.dataLancamento < :fim "
           + "AND e.idEquipe IN :idsEquipes "
           + "ORDER BY e.dataLancamento")
    List<LancamentoResumido> listarLancamentosResumidos(@Param("inicio") OffsetDateTime inicio,
                                                        @Param("fim") OffsetDateTime fim,
                                                        @Param("idsEquipes") Collection<UUID> idsEquipes,
                                                        @Param("status") StatusExecucao status);

    /** Notas concluídas do período cujos serviços são todos improdutivos (e há ao menos um). */
    @Query(value = "SELECT e.id FROM execucoes_comercial e "
           + "WHERE e.ativo = true AND e.status_execucao = 'CONCLUIDO' "
           + "AND e.data_lancamento >= :inicio AND e.data_lancamento < :fim "
           + "AND e.id_equipe IN (:idsEquipes) "
           + "AND EXISTS (SELECT 1 FROM execucoes_acoes ea JOIN acoes a ON a.id = ea.id_acao "
           + "            WHERE ea.id_execucao = e.id AND a.improdutiva = true) "
           + "AND NOT EXISTS (SELECT 1 FROM execucoes_acoes ea JOIN acoes a ON a.id = ea.id_acao "
           + "                WHERE ea.id_execucao = e.id AND a.improdutiva = false)",
           nativeQuery = true)
    List<UUID> listarIdsSoImprodutivas(@Param("inicio") OffsetDateTime inicio,
                                       @Param("fim") OffsetDateTime fim,
                                       @Param("idsEquipes") Collection<UUID> idsEquipes);

    List<ExecucaoComercial> findByIdTurnoAndAtivoTrueOrderByDataLancamentoAsc(UUID idTurno);

    List<ExecucaoComercial> findByIdTurnoInAndAtivoTrueOrderByDataLancamentoAsc(Collection<UUID> idsTurnos);

    @Query("SELECT new com.nexo.app.modules.execucao.application.dto.ProducaoDoTurno("
           + "e.idTurno, COUNT(e), COALESCE(SUM(e.valorTotalFaturado), 0), MIN(e.dataLancamento), MAX(e.dataLancamento)) "
           + "FROM ExecucaoComercial e "
           + "WHERE e.ativo = true AND e.statusExecucao = :status AND e.idTurno IN :idsTurnos "
           + "GROUP BY e.idTurno")
    List<ProducaoDoTurno> resumirPorTurnos(@Param("idsTurnos") Collection<UUID> idsTurnos,
                                           @Param("status") StatusExecucao status);

    @Query("SELECT new com.nexo.app.modules.execucao.application.dto.UltimoLancamentoDoTurno("
           + "e.idTurno, MAX(e.dataLancamento)) "
           + "FROM ExecucaoComercial e "
           + "WHERE e.ativo = true AND e.idTurno IN :idsTurnos "
           + "GROUP BY e.idTurno")
    List<UltimoLancamentoDoTurno> buscarUltimosLancamentos(@Param("idsTurnos") Collection<UUID> idsTurnos);

    /** Por veículo do turno: notas no status lançadas em {@code [inicio, fim)} e o valor faturado. */
    @Query("SELECT t.idVeiculo, COUNT(e), COALESCE(SUM(e.valorTotalFaturado), 0) "
           + "FROM ExecucaoComercial e, Turno t "
           + "WHERE t.id = e.idTurno AND t.idVeiculo IS NOT NULL AND e.ativo = true AND e.statusExecucao = :status "
           + "AND e.dataLancamento >= :inicio AND e.dataLancamento < :fim "
           + "GROUP BY t.idVeiculo")
    List<Object[]> somarConcluidasPorVeiculoDoTurno(@Param("status") StatusExecucao status,
                                                   @Param("inicio") OffsetDateTime inicio,
                                                   @Param("fim") OffsetDateTime fim);
}
