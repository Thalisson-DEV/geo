package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.DespesaVeiculo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;
import java.util.UUID;

public interface DespesaVeiculoRepository extends JpaRepository<DespesaVeiculo, UUID>, JpaSpecificationExecutor<DespesaVeiculo> {

    Optional<DespesaVeiculo> findByIdSolicitacaoFinanceira(UUID idSolicitacao);

    /** Últimas despesas do veículo de um tipo (ex.: as lavagens que o gestor confere em campo). */
    java.util.List<DespesaVeiculo> findTop5ByIdVeiculoAndTipoCodigoAndAtivoTrueOrderByDataDescDataCriacaoDesc(UUID idVeiculo,
                                                                                                          String codigoTipo);

    Optional<DespesaVeiculo> findByReferenciaExternaSistemaOrigemAndReferenciaExternaIdExterno(String sistemaOrigem, String idExterno);
}
