package com.nexo.app.modules.rh.infrastructure.persistence;

import com.nexo.app.modules.rh.domain.HistoricoMedidaDisciplinar;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface HistoricoMedidaDisciplinarRepository extends JpaRepository<HistoricoMedidaDisciplinar, UUID> {

    List<HistoricoMedidaDisciplinar> findAllByIdMedidaOrderByOcorridoEmAsc(UUID idMedida);
}
