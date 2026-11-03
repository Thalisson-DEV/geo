package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.ProdutoAbastecimento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.UUID;

public interface ProdutoAbastecimentoRepository extends JpaRepository<ProdutoAbastecimento, UUID>, JpaSpecificationExecutor<ProdutoAbastecimento> {

    boolean existsByNomeIgnoreCaseAndAtivoTrue(String nome);

    boolean existsByNomeIgnoreCaseAndAtivoTrueAndIdNot(String nome, UUID id);

    List<ProdutoAbastecimento> findAllByAtivoTrueOrderByCategoriaAscNomeAsc();
}
