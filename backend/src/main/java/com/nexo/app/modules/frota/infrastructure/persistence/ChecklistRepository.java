package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.Checklist;
import com.nexo.app.modules.frota.domain.FinalidadeChecklist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChecklistRepository extends JpaRepository<Checklist, UUID>, JpaSpecificationExecutor<Checklist> {

    Optional<Checklist> findByIdAparelho(UUID idAparelho);

    /** Último checklist de uso do veículo antes do instante: quem estava com ele. */
    Optional<Checklist> findFirstByIdVeiculoAndFinalidadeAndPreenchidoEmBeforeAndAtivoTrueOrderByPreenchidoEmDesc(
            UUID idVeiculo, FinalidadeChecklist finalidade, OffsetDateTime instante);

    /** O veículo tem checklist da finalidade no intervalo (o de uso do dia, para o abastecimento). */
    boolean existsByIdVeiculoAndFinalidadeAndPreenchidoEmGreaterThanEqualAndPreenchidoEmLessThanAndAtivoTrue(
            UUID idVeiculo, FinalidadeChecklist finalidade, OffsetDateTime inicio, OffsetDateTime fim);

    List<Checklist> findAllByPreenchidoEmGreaterThanEqualAndPreenchidoEmLessThanAndAtivoTrue(OffsetDateTime inicio,
                                                                                            OffsetDateTime fim);

    /** Checklists que a pessoa preencheu desde o instante (consulta "Meus" no app). */
    List<Checklist> findTop50ByIdUsuarioPreenchimentoAndPreenchidoEmGreaterThanEqualAndAtivoTrueOrderByPreenchidoEmDesc(
            UUID idUsuario, OffsetDateTime desde);

    /** Últimos checklists do veículo (histórico no app). */
    List<Checklist> findTop20ByIdVeiculoAndAtivoTrueOrderByPreenchidoEmDesc(UUID idVeiculo);
}
