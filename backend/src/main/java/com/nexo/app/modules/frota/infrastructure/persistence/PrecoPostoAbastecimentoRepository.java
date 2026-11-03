package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.PrecoPostoAbastecimento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PrecoPostoAbastecimentoRepository extends JpaRepository<PrecoPostoAbastecimento, UUID> {

    /** Histórico do posto, do mais recente para o mais antigo. */
    List<PrecoPostoAbastecimento> findAllByPostoIdAndAtivoTrueOrderByVigenteDesdeDescDataCriacaoDesc(UUID idPosto);

    Optional<PrecoPostoAbastecimento> findByPostoIdAndProdutoIdAndVigenteDesdeAndAtivoTrue(UUID idPosto, UUID idProduto,
                                                                                         LocalDate vigenteDesde);

    /** Preço que vale na data: o mais recente com vigência até ela. */
    Optional<PrecoPostoAbastecimento> findFirstByPostoIdAndProdutoIdAndVigenteDesdeLessThanEqualAndAtivoTrueOrderByVigenteDesdeDesc(
            UUID idPosto, UUID idProduto, LocalDate data);

    /** Preços vigentes na data de vários postos (um por posto e produto). */
    @Query("""
            SELECT p FROM PrecoPostoAbastecimento p
            WHERE p.ativo = TRUE AND p.posto.id IN :postos AND p.vigenteDesde <= :data
              AND p.vigenteDesde = (SELECT MAX(o.vigenteDesde) FROM PrecoPostoAbastecimento o
                                    WHERE o.ativo = TRUE AND o.posto = p.posto AND o.produto = p.produto AND o.vigenteDesde <= :data)
            """)
    List<PrecoPostoAbastecimento> vigentes(@Param("postos") Collection<UUID> idsPosto, @Param("data") LocalDate data);
}
