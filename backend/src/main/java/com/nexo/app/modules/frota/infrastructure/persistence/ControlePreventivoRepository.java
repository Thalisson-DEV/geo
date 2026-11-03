package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.ControlePreventivo;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ControlePreventivoRepository extends JpaRepository<ControlePreventivo, UUID> {

    /** Inclui os desativados: um controle que volta a valer é reativado, não duplicado. */
    @EntityGraph(attributePaths = "plano")
    List<ControlePreventivo> findAllByIdVeiculoIn(Collection<UUID> idsVeiculo);

    @EntityGraph(attributePaths = "plano")
    List<ControlePreventivo> findAll();

    @EntityGraph(attributePaths = "plano")
    List<ControlePreventivo> findAllByAtivoTrue();

    @EntityGraph(attributePaths = "plano")
    List<ControlePreventivo> findAllByIdVeiculoAndAtivoTrue(UUID idVeiculo);

    @EntityGraph(attributePaths = "plano")
    List<ControlePreventivo> findAllByIdIn(Collection<UUID> ids);

    @EntityGraph(attributePaths = "plano")
    List<ControlePreventivo> findAllByIdVeiculoInAndAtivoTrue(Collection<UUID> idsVeiculo);

    long countByPlanoIdAndAtivoTrue(UUID idPlano);
}
