package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.ParcelaApolice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ParcelaApoliceRepository extends JpaRepository<ParcelaApolice, UUID> {

    Optional<ParcelaApolice> findByIdSolicitacaoFinanceira(UUID idSolicitacao);
}
