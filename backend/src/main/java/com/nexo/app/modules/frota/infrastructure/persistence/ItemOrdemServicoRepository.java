package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.ItemOrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface ItemOrdemServicoRepository extends JpaRepository<ItemOrdemServico, UUID> {

    /**
     * Itens iguais em OS concluídas da mesma placa com fim real dentro do intervalo, da
     * mais recente para a mais antiga.
     */
    @Query("""
            select i from ItemOrdemServico i join fetch i.ordem o
            where o.idVeiculo = :idVeiculo and i.item.id = :idItem and o.situacao = :concluida
              and o.ativo = true and o.id <> :idIgnorar
              and o.fimReal >= :desde and o.fimReal <= :ate
            order by o.fimReal desc
            """)
    List<ItemOrdemServico> buscarAnteriores(@Param("idVeiculo") UUID idVeiculo,
                                            @Param("idItem") UUID idItem,
                                            @Param("idIgnorar") UUID idIgnorar,
                                            @Param("desde") OffsetDateTime desde,
                                            @Param("ate") OffsetDateTime ate,
                                            @Param("concluida") SituacaoOrdemServico concluida,
                                            Pageable pageable);
}
