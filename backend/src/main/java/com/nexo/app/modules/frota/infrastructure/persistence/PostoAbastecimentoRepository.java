package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.PostoAbastecimento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.UUID;

public interface PostoAbastecimentoRepository extends JpaRepository<PostoAbastecimento, UUID>, JpaSpecificationExecutor<PostoAbastecimento> {

    boolean existsByNomeIgnoreCaseAndAtivoTrue(String nome);

    boolean existsByNomeIgnoreCaseAndAtivoTrueAndIdNot(String nome, UUID id);

    List<PostoAbastecimento> findAllByAtivoTrueOrderByNomeAsc();
}
