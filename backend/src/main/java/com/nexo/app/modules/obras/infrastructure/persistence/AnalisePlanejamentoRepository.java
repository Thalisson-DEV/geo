package com.nexo.app.modules.obras.infrastructure.persistence;

import com.nexo.app.modules.obras.domain.AnalisePlanejamento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface AnalisePlanejamentoRepository extends JpaRepository<AnalisePlanejamento, UUID> {

    Optional<AnalisePlanejamento> findByIdAndIdObraAndAtivoTrue(UUID id, UUID idObra);

    Optional<AnalisePlanejamento> findFirstByIdObraAndPaginaOrderByDataCriacaoDesc(UUID idObra, Integer pagina);

    /**
     * Progresso de uma leitura em andamento, mostrado na tela enquanto ela não termina. Atualiza só a mensagem, sem
     * passar pela versão da entidade: quem processa grava o resultado final por cima.
     */
    @Modifying
    @Transactional
    @Query("update AnalisePlanejamento a set a.mensagem = :progresso where a.id = :id"
            + " and a.status = com.nexo.app.modules.obras.domain.StatusAnalisePlanejamento.PROCESSANDO")
    int registrarProgresso(UUID id, String progresso);
}
