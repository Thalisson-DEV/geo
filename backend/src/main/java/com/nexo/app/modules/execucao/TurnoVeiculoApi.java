package com.nexo.app.modules.execucao;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Turnos com o veículo confirmado na abertura e as notas lançadas com coordenada, para a frota
 * cruzar com a telemetria (turno no mapa, produtividade por km, nota fora do local). Só tipos
 * deste pacote: quem consome não depende dos internos da execução.
 */
public interface TurnoVeiculoApi {

    record TurnoDoVeiculo(
            UUID idTurno,
            UUID idEquipe,
            UUID idVeiculo,
            OffsetDateTime inicio,
            /* Nulo enquanto o turno está aberto. */
            OffsetDateTime fim,
            boolean encerradoAutomaticamente
    ) {
    }

    record NotaGeorreferenciada(
            UUID idExecucao,
            UUID idTurno,
            String referenciaNota,
            OffsetDateTime dataLancamento,
            boolean concluida,
            BigDecimal valor,
            /* Nulos quando o aparelho lançou sem posição. */
            Double latitude,
            Double longitude
    ) {
    }

    /** Turnos com veículo que estiveram abertos em algum momento de {@code [inicio, fim)}, em ordem de abertura. */
    List<TurnoDoVeiculo> listarComVeiculo(OffsetDateTime inicio, OffsetDateTime fim);

    /** Turnos com veículo fechados em {@code [inicio, fim)}, em ordem de fechamento (no máximo {@code limite}). */
    List<TurnoDoVeiculo> listarFechadosComVeiculo(OffsetDateTime inicio, OffsetDateTime fim, int limite);

    Optional<TurnoDoVeiculo> buscar(UUID idTurno);

    /** Os turnos informados que existem; os sem veículo também vêm (com {@code idVeiculo} nulo). */
    List<TurnoDoVeiculo> buscarVarios(Collection<UUID> idsTurnos);

    /** Notas ativas (concluídas ou não) dos turnos informados, em ordem de lançamento. */
    List<NotaGeorreferenciada> listarNotas(Collection<UUID> idsTurnos);
}
