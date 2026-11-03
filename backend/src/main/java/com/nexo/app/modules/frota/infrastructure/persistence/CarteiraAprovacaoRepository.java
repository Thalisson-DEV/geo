package com.nexo.app.modules.frota.infrastructure.persistence;

import com.nexo.app.modules.frota.domain.CarteiraAprovacao;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CarteiraAprovacaoRepository extends JpaRepository<CarteiraAprovacao, UUID> {

    Optional<CarteiraAprovacao> findByIdUsuarioAndAtivoTrue(UUID idUsuario);

    List<CarteiraAprovacao> findAllByIdUsuarioInAndAtivoTrue(List<UUID> idsUsuario);

    /** Quem aprova a placa: os donos das carteiras ativas que a contêm. */
    @Query("select c.idUsuario from CarteiraAprovacao c join c.idsVeiculo v where c.ativo = true and v = :idVeiculo")
    List<UUID> aprovadoresDaPlaca(@Param("idVeiculo") UUID idVeiculo);
}
