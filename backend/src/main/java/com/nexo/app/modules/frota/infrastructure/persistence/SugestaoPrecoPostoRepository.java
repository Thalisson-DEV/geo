package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.SugestaoPrecoPosto;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SugestaoPrecoPostoRepository extends JpaRepository<SugestaoPrecoPosto, UUID> {

    Optional<SugestaoPrecoPosto> findByIdAbastecimentoAndProdutoIdAndAtivoTrue(UUID idAbastecimento, UUID idProduto);

    List<SugestaoPrecoPosto> findAllByIdAbastecimentoAndAtivoTrueOrderByDataCriacaoAsc(UUID idAbastecimento);

    List<SugestaoPrecoPosto> findAllBySituacaoInAndAtivoTrueOrderByDataCriacaoDesc(Collection<SugestaoPrecoPosto.Situacao> situacoes);
}
