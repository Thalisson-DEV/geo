package com.nexo.app.modules.estoque.infrastructure.persistence;

import com.nexo.app.modules.estoque.domain.ParametroMaterialEstoque;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ParametroMaterialEstoqueRepository extends JpaRepository<ParametroMaterialEstoque, UUID> {

    Optional<ParametroMaterialEstoque> findByIdEstoqueAndIdMaterial(UUID idEstoque, UUID idMaterial);

    List<ParametroMaterialEstoque> findAllByIdEstoqueIn(Collection<UUID> idsEstoque);
}
