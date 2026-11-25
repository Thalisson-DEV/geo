package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.domain.ParametrosEstoque;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ParametrosEstoqueRepository extends JpaRepository<ParametrosEstoque, UUID> {
}
