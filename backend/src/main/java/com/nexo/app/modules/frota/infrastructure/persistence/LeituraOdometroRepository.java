package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.LeituraOdometro;
import com.nexo.app.modules.frota.domain.OrigemLeituraOdometro;
import com.nexo.app.modules.frota.domain.SituacaoLeituraOdometro;
import com.nexo.app.modules.frota.domain.TipoLeituraOdometro;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LeituraOdometroRepository extends JpaRepository<LeituraOdometro, UUID>, JpaSpecificationExecutor<LeituraOdometro> {

    Optional<LeituraOdometro> findByOrigemAndIdOrigem(OrigemLeituraOdometro origem, UUID idOrigem);

    /** Última leitura do tipo até o instante (com TROCA_PAINEL: início do trecho). */
    Optional<LeituraOdometro> findFirstByIdVeiculoAndTipoAndSituacaoAndLidoEmLessThanEqualOrderByLidoEmDesc(
            UUID idVeiculo, TipoLeituraOdometro tipo, SituacaoLeituraOdometro situacao, OffsetDateTime instante);

    /** Primeira leitura do tipo depois do instante (com TROCA_PAINEL: fim do trecho). */
    Optional<LeituraOdometro> findFirstByIdVeiculoAndTipoAndSituacaoAndLidoEmAfterOrderByLidoEmAsc(
            UUID idVeiculo, TipoLeituraOdometro tipo, SituacaoLeituraOdometro situacao, OffsetDateTime instante);

    /** Vizinha anterior dentro do trecho: lidoEm entre o início do trecho e o instante, inclusive. */
    Optional<LeituraOdometro> findFirstByIdVeiculoAndSituacaoAndLidoEmBetweenOrderByLidoEmDescKmDesc(
            UUID idVeiculo, SituacaoLeituraOdometro situacao, OffsetDateTime inicioTrecho, OffsetDateTime instante);

    /** Vizinha seguinte dentro do trecho: depois do instante e antes da próxima troca. */
    Optional<LeituraOdometro> findFirstByIdVeiculoAndSituacaoAndLidoEmAfterAndLidoEmBeforeOrderByLidoEmAscKmAsc(
            UUID idVeiculo, SituacaoLeituraOdometro situacao, OffsetDateTime instante, OffsetDateTime fimTrecho);

    boolean existsByIdVeiculoAndSituacao(UUID idVeiculo, SituacaoLeituraOdometro situacao);

    /** Leitura mais recente na situação, em qualquer trecho. */
    Optional<LeituraOdometro> findFirstByIdVeiculoAndSituacaoOrderByLidoEmDescKmDesc(
            UUID idVeiculo, SituacaoLeituraOdometro situacao);

    List<LeituraOdometro> findAllByIdVeiculoInAndTipoAndSituacaoOrderByLidoEmAsc(
            Collection<UUID> idsVeiculo, TipoLeituraOdometro tipo, SituacaoLeituraOdometro situacao);

    /** Maior leitura válida a partir do início do trecho atual. */
    Optional<LeituraOdometro> findFirstByIdVeiculoAndSituacaoAndLidoEmGreaterThanEqualOrderByKmDescLidoEmDesc(
            UUID idVeiculo, SituacaoLeituraOdometro situacao, OffsetDateTime inicioTrecho);

    Page<LeituraOdometro> findAllByIdVeiculoOrderByLidoEmDescKmDesc(UUID idVeiculo, Pageable pageable);

    /**
     * Valor atual (maior leitura válida do trecho atual, depois da última troca de painel) e
     * data da leitura válida mais recente, por veículo.
     */
    @Query("""
            SELECT l.idVeiculo AS idVeiculo, MAX(l.km) AS km, MAX(l.lidoEm) AS lidoEm
              FROM LeituraOdometro l
             WHERE l.situacao = com.nexo.app.modules.frota.domain.SituacaoLeituraOdometro.VALIDA
               AND l.idVeiculo IN :idsVeiculo
               AND NOT EXISTS (
                   SELECT 1 FROM LeituraOdometro t
                    WHERE t.idVeiculo = l.idVeiculo
                      AND t.tipo = com.nexo.app.modules.frota.domain.TipoLeituraOdometro.TROCA_PAINEL
                      AND t.situacao = com.nexo.app.modules.frota.domain.SituacaoLeituraOdometro.VALIDA
                      AND t.lidoEm > l.lidoEm)
             GROUP BY l.idVeiculo
            """)
    List<KmAtualProjection> buscarKmAtual(@Param("idsVeiculo") Collection<UUID> idsVeiculo);

    /** Como {@link #buscarKmAtual}, só com leituras de painel: a trava do app ignora a estimativa da telemetria. */
    @Query("""
            SELECT l.idVeiculo AS idVeiculo, MAX(l.km) AS km, MAX(l.lidoEm) AS lidoEm
              FROM LeituraOdometro l
             WHERE l.situacao = com.nexo.app.modules.frota.domain.SituacaoLeituraOdometro.VALIDA
               AND l.origem <> com.nexo.app.modules.frota.domain.OrigemLeituraOdometro.TELEMETRIA
               AND l.idVeiculo IN :idsVeiculo
               AND NOT EXISTS (
                   SELECT 1 FROM LeituraOdometro t
                    WHERE t.idVeiculo = l.idVeiculo
                      AND t.tipo = com.nexo.app.modules.frota.domain.TipoLeituraOdometro.TROCA_PAINEL
                      AND t.situacao = com.nexo.app.modules.frota.domain.SituacaoLeituraOdometro.VALIDA
                      AND t.lidoEm > l.lidoEm)
             GROUP BY l.idVeiculo
            """)
    List<KmAtualProjection> buscarKmAtualPainel(@Param("idsVeiculo") Collection<UUID> idsVeiculo);

    // Leituras de painel (sem a origem informada, a telemetria): o painel prevalece sobre a estimativa.

    Optional<LeituraOdometro> findFirstByIdVeiculoAndSituacaoAndOrigemNotAndLidoEmBetweenOrderByLidoEmDescKmDesc(
            UUID idVeiculo, SituacaoLeituraOdometro situacao, OrigemLeituraOdometro excluida,
            OffsetDateTime inicioTrecho, OffsetDateTime instante);

    Optional<LeituraOdometro> findFirstByIdVeiculoAndSituacaoAndOrigemNotAndLidoEmAfterAndLidoEmBeforeOrderByLidoEmAscKmAsc(
            UUID idVeiculo, SituacaoLeituraOdometro situacao, OrigemLeituraOdometro excluida,
            OffsetDateTime instante, OffsetDateTime fimTrecho);

    Optional<LeituraOdometro> findFirstByIdVeiculoAndSituacaoAndOrigemNotAndLidoEmGreaterThanEqualOrderByKmDescLidoEmDesc(
            UUID idVeiculo, SituacaoLeituraOdometro situacao, OrigemLeituraOdometro excluida, OffsetDateTime inicioTrecho);

    /** Estimativas da origem entre dois instantes com valor acima do informado (superadas pelo painel). */
    List<LeituraOdometro> findAllByIdVeiculoAndSituacaoAndOrigemAndLidoEmBetweenAndKmGreaterThan(
            UUID idVeiculo, SituacaoLeituraOdometro situacao, OrigemLeituraOdometro origem,
            OffsetDateTime de, OffsetDateTime ate, long km);

    @Query("""
            SELECT l.idVeiculo AS idVeiculo, COUNT(l) AS total
              FROM LeituraOdometro l
             WHERE l.situacao = com.nexo.app.modules.frota.domain.SituacaoLeituraOdometro.INCONSISTENTE
               AND l.idVeiculo IN :idsVeiculo
             GROUP BY l.idVeiculo
            """)
    List<ContagemPorVeiculoProjection> contarInconsistentes(@Param("idsVeiculo") Collection<UUID> idsVeiculo);

    /**
     * Faixa de leituras válidas do painel atual desde {@code desde}, por veículo: base da média
     * de uso diária da previsão da preventiva.
     */
    @Query("""
            SELECT l.idVeiculo AS idVeiculo, MIN(l.km) AS menor, MAX(l.km) AS maior,
                   MIN(l.lidoEm) AS primeira, MAX(l.lidoEm) AS ultima
              FROM LeituraOdometro l
             WHERE l.situacao = com.nexo.app.modules.frota.domain.SituacaoLeituraOdometro.VALIDA
               AND l.idVeiculo IN :idsVeiculo
               AND l.lidoEm >= :desde
               AND NOT EXISTS (
                   SELECT 1 FROM LeituraOdometro t
                    WHERE t.idVeiculo = l.idVeiculo
                      AND t.tipo = com.nexo.app.modules.frota.domain.TipoLeituraOdometro.TROCA_PAINEL
                      AND t.situacao = com.nexo.app.modules.frota.domain.SituacaoLeituraOdometro.VALIDA
                      AND t.lidoEm > l.lidoEm)
             GROUP BY l.idVeiculo
            """)
    List<FaixaUsoProjection> buscarFaixaUso(@Param("idsVeiculo") Collection<UUID> idsVeiculo,
                                            @Param("desde") OffsetDateTime desde);

    interface FaixaUsoProjection {
        UUID getIdVeiculo();

        Long getMenor();

        Long getMaior();

        OffsetDateTime getPrimeira();

        OffsetDateTime getUltima();
    }

    interface KmAtualProjection {
        UUID getIdVeiculo();

        Long getKm();

        OffsetDateTime getLidoEm();
    }

    interface ContagemPorVeiculoProjection {
        UUID getIdVeiculo();

        Long getTotal();
    }

    /** Veículos com leitura no período vinda de outra origem que não o checklist (uso do veículo). */
    @Query("""
            SELECT DISTINCT l.idVeiculo FROM LeituraOdometro l
             WHERE l.ativo = true AND l.lidoEm >= :inicio AND l.lidoEm < :fim
               AND l.origem <> com.nexo.app.modules.frota.domain.OrigemLeituraOdometro.CHECKLIST
            """)
    List<UUID> veiculosComLeituraForaDoChecklist(@Param("inicio") OffsetDateTime inicio, @Param("fim") OffsetDateTime fim);
}
