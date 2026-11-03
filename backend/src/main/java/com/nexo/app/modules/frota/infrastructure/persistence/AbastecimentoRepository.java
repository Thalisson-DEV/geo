package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.Abastecimento;
import com.nexo.app.modules.frota.domain.SituacaoAbastecimento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AbastecimentoRepository extends JpaRepository<Abastecimento, UUID>, JpaSpecificationExecutor<Abastecimento> {

    Optional<Abastecimento> findByIdAparelho(UUID idAparelho);

    /** Solicitação em andamento do veículo (no máximo uma, garantida por índice). */
    Optional<Abastecimento> findFirstByIdVeiculoAndSituacaoInAndAtivoTrue(UUID idVeiculo, Collection<SituacaoAbastecimento> situacoes);

    /** Realizados do veículo antes do instante, do mais recente para o mais antigo (histórico da análise). */
    @Query("select a from Abastecimento a where a.idVeiculo = :idVeiculo and a.situacao = 'REALIZADA' and a.ativo = true "
            + "and a.realizadoEm < :antes order by a.realizadoEm desc limit 30")
    List<Abastecimento> realizadosAntes(@Param("idVeiculo") UUID idVeiculo, @Param("antes") OffsetDateTime antes);

    /** Realizados do veículo no período, do mais antigo para o mais recente (consumo pela telemetria). */
    @Query("select a from Abastecimento a where a.idVeiculo = :idVeiculo and a.situacao = 'REALIZADA' and a.ativo = true "
            + "and a.realizadoEm >= :de and a.realizadoEm <= :ate order by a.realizadoEm asc")
    List<Abastecimento> realizadosEntre(@Param("idVeiculo") UUID idVeiculo, @Param("de") OffsetDateTime de,
                                        @Param("ate") OffsetDateTime ate);

    /** Média de R$ por unidade do produto na base desde o instante. */
    @Query("select avg(i.valorUnitario) from ItemAbastecimento i join i.abastecimento a where a.situacao = 'REALIZADA' "
            + "and a.ativo = true and a.idBaseOperacional = :idBase and i.produto.id = :idProduto and i.valorUnitario is not null "
            + "and a.realizadoEm >= :desde and a.id <> :ignorar")
    BigDecimal precoMedio(@Param("idBase") UUID idBase, @Param("idProduto") UUID idProduto,
                          @Param("desde") OffsetDateTime desde, @Param("ignorar") UUID ignorar);

    /** Fotos com o mesmo conteúdo em outros abastecimentos. */
    @Query("select count(f) from FotoAbastecimento f where f.hashArquivo in :hashes and f.abastecimento.id <> :idAbastecimento")
    long fotosRepetidas(@Param("hashes") Collection<String> hashes, @Param("idAbastecimento") UUID idAbastecimento);

    /** O que o app mostra: do usuário ou da equipe dele, desde o instante. */
    /** Do usuário, da equipe dele ou em que ele é o condutor (o avulso lançado na web chega assim). */
    @Query("select a from Abastecimento a where a.ativo = true and a.solicitadoEm >= :desde "
            + "and (a.idUsuarioSolicitante = :idUsuario or (:idEquipe is not null and a.idEquipe = :idEquipe) "
            + "or (:idColaborador is not null and a.idCondutor = :idColaborador)) "
            + "order by a.solicitadoEm desc")
    List<Abastecimento> doUsuarioOuEquipe(@Param("idUsuario") UUID idUsuario, @Param("idEquipe") UUID idEquipe,
                                          @Param("idColaborador") UUID idColaborador, @Param("desde") OffsetDateTime desde);

    /** Realizados do posto no período que estão livres ou já nesta fatura (candidatos da conferência). */
    @Query("select a from Abastecimento a where a.ativo = true and a.situacao = 'REALIZADA' and a.posto.id = :idPosto "
            + "and a.realizadoEm >= :inicio and a.realizadoEm < :fim and (a.idFatura is null or a.idFatura = :idFatura) "
            + "order by a.realizadoEm")
    List<Abastecimento> candidatosFatura(@Param("idPosto") UUID idPosto, @Param("inicio") OffsetDateTime inicio,
                                         @Param("fim") OffsetDateTime fim, @Param("idFatura") UUID idFatura);

    List<Abastecimento> findAllByIdFatura(UUID idFatura);

    List<Abastecimento> findAllByIdVeiculoInAndSituacaoInAndAtivoTrue(Collection<UUID> idsVeiculo,
                                                                     Collection<SituacaoAbastecimento> situacoes);

    List<Abastecimento> findAllBySituacaoInAndVenceEmLessThanEqualAndAtivoTrue(Collection<SituacaoAbastecimento> situacoes,
                                                                             OffsetDateTime instante);
}
