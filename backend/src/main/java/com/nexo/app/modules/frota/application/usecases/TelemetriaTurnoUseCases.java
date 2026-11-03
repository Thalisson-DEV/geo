package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.execucao.TurnoVeiculoApi;
import com.nexo.app.modules.execucao.TurnoVeiculoApi.TurnoDoVeiculo;
import com.nexo.app.modules.frota.FrotaTelemetriaTurnoApi;
import com.nexo.app.modules.frota.domain.AnaliseTrajeto;
import com.nexo.app.modules.frota.domain.SituacaoNotaGeo;
import com.nexo.app.modules.frota.infrastructure.persistence.AnaliseTelemetriaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * O turno visto pela telemetria, para as telas da execução. O fechado vem do resumo gravado pelo
 * job; o aberto e o detalhe de qualquer turno são calculados na hora.
 */
@Service
@RequiredArgsConstructor
public class TelemetriaTurnoUseCases implements FrotaTelemetriaTurnoApi {

    private final AnaliseTelemetriaRepository analises;
    private final CalculoAnalisesFrota calculo;
    private final ReferenciasFrota referencias;
    private final TurnoVeiculoApi turnoApi;
    private final TelemetriaFrotaUseCases telemetria;

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, ResumoTurno> resumir(Collection<UUID> idsTurnos) {
        if (idsTurnos == null || idsTurnos.isEmpty()) return Map.of();
        var resultado = new HashMap<UUID, ResumoTurno>();
        var gravados = analises.listarTurnosPorIds(idsTurnos);
        gravados.stream().filter(AnaliseTelemetriaRepository.Turno::comTelemetria).forEach(t -> resultado.put(t.idTurno(), resumo(t)));
        // Sem resumo gravado (aberto, ou fechado antes da próxima rodada do job): calcula agora. Turno que terminou
        // antes da primeira posição guardada não tem o que cruzar; o que já tem resumo, mesmo sem trajeto, não é refeito.
        var jaResumidos = gravados.stream().map(AnaliseTelemetriaRepository.Turno::idTurno).collect(Collectors.toSet());
        var primeiraPosicao = analises.primeiraPosicao();
        if (primeiraPosicao == null) return resultado;
        var pendentes = turnoApi.buscarVarios(idsTurnos.stream().filter(id -> !jaResumidos.contains(id)).toList()).stream()
                .filter(t -> t.idVeiculo() != null && (t.fim() == null || t.fim().isAfter(primeiraPosicao)))
                .toList();
        if (!pendentes.isEmpty()) {
            var equipes = referencias.equipesComBase(pendentes.stream().map(TurnoDoVeiculo::idEquipe).collect(Collectors.toSet()));
            var notas = turnoApi.listarNotas(pendentes.stream().map(TurnoDoVeiculo::idTurno).toList()).stream()
                    .collect(Collectors.groupingBy(TurnoVeiculoApi.NotaGeorreferenciada::idTurno));
            var agora = OffsetDateTime.now();
            for (var t : pendentes) {
                var calculado = calculo.calcularTurno(t, notas.getOrDefault(t.idTurno(), List.of()), equipes.get(t.idEquipe()), agora);
                if (calculado.resumo().comTelemetria()) resultado.put(t.idTurno(), resumo(calculado.resumo()));
            }
        }
        return resultado;
    }

    /**
     * Pelo histórico do provedor (segue a via e cobre o turno mesmo sem posição gravada aqui): o
     * desenho, o km, as paradas e onde estava o veículo em cada nota. Sem ele, pelas posições
     * gravadas. Sem transação: a chamada ao provedor não segura conexão do banco.
     */
    @Override
    public Optional<TrajetoTurno> trajeto(UUID idTurno) {
        var turno = turnoApi.buscar(idTurno).orElse(null);
        if (turno == null || turno.idVeiculo() == null) return Optional.empty();
        var equipe = referencias.equipesComBase(List.of(turno.idEquipe())).get(turno.idEquipe());
        var agora = OffsetDateTime.now();
        var doProvedor = telemetria.historicoDoVeiculo(turno.idVeiculo(), turno.inicio(), CalculoAnalisesFrota.fimDoTurno(turno, agora));
        var c = calculo.calcularTurno(turno, turnoApi.listarNotas(List.of(idTurno)), equipe, agora, doProvedor == null ? null
                : doProvedor.stream().map(l -> new AnaliseTrajeto.Ponto(l.lidoEm(), l.latitude(), l.longitude(), l.velocidadeKmh(),
                        l.ignicao(), l.odometroMetros())).toList());
        if (!c.resumo().comTelemetria()) return Optional.empty();
        var base = c.base() == null ? null : new BaseNoMapa(c.base().nome(), c.base().latitude(), c.base().longitude(), c.raioBaseMetros());
        var trajeto = c.trajeto().stream().filter(AnaliseTrajeto.Ponto::temCoordenada)
                .map(p -> new PontoTrajeto(p.em(), p.latitude(), p.longitude())).toList();
        var paradas = c.paradas().stream().map(p -> new Parada(p.parada().de(), p.parada().ate(),
                (int) Math.round(p.parada().minutos()), p.parada().latitude(), p.parada().longitude(), p.tipo().name(),
                p.tipo().getRotulo())).toList();
        var notas = c.notas().stream().map(n -> {
            var situacao = SituacaoNotaGeo.valueOf(n.situacao());
            return new NotaNoTrajeto(n.idExecucao(), situacao.name(), situacao.getRotulo(), n.distanciaMetros(),
                    n.latitudeVeiculo(), n.longitudeVeiculo());
        }).toList();
        return Optional.of(new TrajetoTurno(resumo(c.resumo()), base, trajeto, paradas, notas, CalculoAnalisesFrota.RAIO_NOTA_METROS));
    }

    static ResumoTurno resumo(AnaliseTelemetriaRepository.Turno t) {
        Integer ateSair = t.saidaBaseEm() == null ? null
                : (int) Math.max(0, Duration.between(t.inicio(), t.saidaBaseEm()).toMinutes());
        BigDecimal porKm = t.km() >= 1 && t.valorFaturado() != null && t.valorFaturado().signum() > 0
                ? t.valorFaturado().divide(BigDecimal.valueOf(t.km()), 2, RoundingMode.HALF_UP) : null;
        return new ResumoTurno(t.idTurno(), Math.round(t.km() * 10) / 10.0, t.saidaBaseEm(), ateSair, t.chegadaBaseEm(),
                t.minutosMovimento(), t.minutosParadoServico(), t.minutosParadoSemServico(), t.minutosParadoBase(),
                t.notasForaLocal(), porKm);
    }
}
