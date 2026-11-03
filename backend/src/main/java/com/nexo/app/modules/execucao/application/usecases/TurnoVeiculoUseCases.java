package com.nexo.app.modules.execucao.application.usecases;

import com.nexo.app.modules.execucao.TurnoVeiculoApi;
import com.nexo.app.modules.execucao.domain.ExecucaoComercial;
import com.nexo.app.modules.execucao.domain.StatusExecucao;
import com.nexo.app.modules.execucao.domain.Turno;
import com.nexo.app.modules.execucao.infrastructure.persistence.ExecucaoComercialRepository;
import com.nexo.app.modules.execucao.infrastructure.persistence.TurnoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Turnos e notas georreferenciadas para a análise da frota. */
@Service
@RequiredArgsConstructor
public class TurnoVeiculoUseCases implements TurnoVeiculoApi {

    private final TurnoRepository turnos;
    private final ExecucaoComercialRepository execucoes;

    @Override
    @Transactional(readOnly = true)
    public List<TurnoDoVeiculo> listarComVeiculo(OffsetDateTime inicio, OffsetDateTime fim) {
        return turnos.listarComVeiculoSobrepostos(inicio, fim).stream().map(TurnoVeiculoUseCases::turno).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<TurnoDoVeiculo> listarFechadosComVeiculo(OffsetDateTime inicio, OffsetDateTime fim, int limite) {
        return turnos.listarFechadosComVeiculo(inicio, fim, PageRequest.of(0, Math.max(1, limite))).stream()
                .map(TurnoVeiculoUseCases::turno).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TurnoDoVeiculo> buscar(UUID idTurno) {
        return idTurno == null ? Optional.empty() : turnos.findById(idTurno).filter(Turno::isAtivo).map(TurnoVeiculoUseCases::turno);
    }

    @Override
    @Transactional(readOnly = true)
    public List<TurnoDoVeiculo> buscarVarios(Collection<UUID> idsTurnos) {
        if (idsTurnos == null || idsTurnos.isEmpty()) return List.of();
        return turnos.findAllById(idsTurnos).stream().filter(Turno::isAtivo).map(TurnoVeiculoUseCases::turno).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<NotaGeorreferenciada> listarNotas(Collection<UUID> idsTurnos) {
        if (idsTurnos == null || idsTurnos.isEmpty()) {
            return List.of();
        }
        return execucoes.findByIdTurnoInAndAtivoTrueOrderByDataLancamentoAsc(idsTurnos).stream()
                .map(TurnoVeiculoUseCases::nota).toList();
    }

    private static TurnoDoVeiculo turno(Turno t) {
        return new TurnoDoVeiculo(t.getId(), t.getIdEquipe(), t.getIdVeiculo(), t.getDataInicio(), t.getDataFim(),
                t.isEncerradoAutomaticamente());
    }

    private static NotaGeorreferenciada nota(ExecucaoComercial e) {
        return new NotaGeorreferenciada(e.getId(), e.getIdTurno(), e.getReferenciaNota(), e.getDataLancamento(),
                e.getStatusExecucao() == StatusExecucao.CONCLUIDO, e.getValorTotalFaturado(),
                e.getLatitude() == null ? null : e.getLatitude().doubleValue(),
                e.getLongitude() == null ? null : e.getLongitude().doubleValue());
    }
}
