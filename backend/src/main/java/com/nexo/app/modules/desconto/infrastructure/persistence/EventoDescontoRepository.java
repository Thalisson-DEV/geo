package com.nexo.app.modules.desconto.infrastructure.persistence;

import com.nexo.app.modules.desconto.domain.EventoDesconto;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EventoDescontoRepository extends JpaRepository<EventoDesconto, UUID> {

    List<EventoDesconto> findByIdDescontoOrderByOcorridoEmAsc(UUID idDesconto);
}
