package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.TurnoObraResponses;
import com.nexo.app.modules.obras.domain.AprTurno;
import com.nexo.app.modules.obras.domain.OcorrenciaTurno;
import com.nexo.app.modules.obras.domain.PresencaObra;
import com.nexo.app.modules.obras.domain.SituacaoLiberacao;
import com.nexo.app.modules.obras.domain.StatusAprTurno;
import com.nexo.app.modules.obras.domain.StatusOperacionalEquipe;
import com.nexo.app.modules.obras.infrastructure.persistence.ApontamentoExecucaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.AprTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.OcorrenciaTurnoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.PresencaObraRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Status em tempo real das equipes de Obras, para a central, o boletim e o app do supervisor. Calculado dos eventos do
 * dia (turno, chegada/saída, apontamento, "sem condição"), com o limite de inatividade configurável
 * ({@code geo.obras.status.minutos-inatividade}).
 */
@Service
@RequiredArgsConstructor
public class StatusEquipesObras {

    /** Uma linha por equipe de Obras. */
    public record StatusEquipe(UUID idEquipe, String codigo, String baseOperacional, StatusOperacionalEquipe status, String rotulo,
                               UUID idTurno, UUID idObraAtual, String numeroObraAtual, int programacoesHoje, int concluidas,
                               int aprsPendentes, int ocorrenciasImpeditivas, OffsetDateTime ultimaAtividade, String lider) {
    }

    private final ConsultarTurnosObra consultas;
    private final PresencaObraRepository presencaRepository;
    private final ApontamentoExecucaoRepository apontamentoRepository;
    private final OcorrenciaTurnoRepository ocorrenciaRepository;
    private final AprTurnoRepository aprRepository;
    private final ObraRepository obraRepository;

    @Value("${geo.obras.status.minutos-inatividade:90}")
    private long minutosInatividade = 90;

    @Transactional(readOnly = true)
    public List<StatusEquipe> listar(UUID idBase) {
        TurnoObraResponses.Boletim boletim = consultas.boletim(null, idBase);
        OffsetDateTime agora = OffsetDateTime.now(ApontamentoExecucaoUseCases.FUSO);
        Set<UUID> turnos = boletim.equipes().stream().map(TurnoObraResponses.EquipeBoletim::idTurno).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, List<PresencaObra>> presencas = turnos.isEmpty() ? Map.of()
                : presencaRepository.findByIdTurnoInAndAtivoTrueOrderByCampoDataOrigemAsc(turnos).stream().collect(Collectors.groupingBy(PresencaObra::getIdTurno));
        Map<UUID, OffsetDateTime> ultimoApontamento = new HashMap<>();
        if (!turnos.isEmpty()) {
            for (Object[] linha : apontamentoRepository.ultimoPorTurno(turnos)) {
                ultimoApontamento.put((UUID) linha[0], (OffsetDateTime) linha[1]);
            }
        }
        Map<UUID, List<OcorrenciaTurno>> impedimentos = turnos.isEmpty() ? Map.of()
                : ocorrenciaRepository.findByIdTurnoInAndAtivoTrue(turnos).stream().filter(OcorrenciaTurno::isImpedeExecucao)
                .collect(Collectors.groupingBy(OcorrenciaTurno::getIdTurno));
        Map<UUID, List<AprTurno>> aprs = turnos.isEmpty() ? Map.of()
                : aprRepository.findByIdTurnoInAndAtivoTrue(turnos).stream().collect(Collectors.groupingBy(AprTurno::getIdTurno));

        return boletim.equipes().stream().map(e -> {
            UUID turno = e.idTurno();
            List<PresencaObra> doTurno = turno != null ? presencas.getOrDefault(turno, List.of()) : List.of();
            PresencaObra ultimaChegada = ultima(doTurno, PresencaObra.Tipo.CHEGADA);
            PresencaObra ultimaSaida = ultima(doTurno, PresencaObra.Tipo.SAIDA);
            List<OcorrenciaTurno> imp = turno != null ? impedimentos.getOrDefault(turno, List.of()) : List.of();
            OffsetDateTime ultimoImpedimento = imp.stream().map(OcorrenciaTurno::momento).max(Comparator.naturalOrder()).orElse(null);
            OffsetDateTime ultimaApr = (turno != null ? aprs.getOrDefault(turno, List.of()) : List.<AprTurno>of()).stream()
                    .filter(a -> a.getStatus() == StatusAprTurno.CONCLUIDA).map(AprTurno::getDataConclusao).filter(Objects::nonNull)
                    .max(Comparator.naturalOrder()).orElse(null);
            List<TurnoObraResponses.AgendaDoDia> agenda = e.agenda() != null ? e.agenda() : List.of();
            boolean pendente = agenda.stream().anyMatch(a -> a.itensConcluidos() < a.itens());
            StatusOperacionalEquipe status = StatusOperacionalEquipe.calcular(new StatusOperacionalEquipe.Fatos(
                    e.situacao() == TurnoObraResponses.SituacaoEquipe.EM_TURNO, e.situacao() == TurnoObraResponses.SituacaoEquipe.ENCERRADO,
                    ultimaChegada != null ? ultimaChegada.getCampo().momentoConfiavel() : null,
                    ultimaSaida != null ? ultimaSaida.getCampo().momentoConfiavel() : null,
                    turno != null ? ultimoApontamento.get(turno) : null, ultimoImpedimento, ultimaApr, pendente),
                    agora, Duration.ofMinutes(minutosInatividade));
            UUID obraAtual = ultimaChegada != null ? ultimaChegada.getIdObra() : null;
            String numeroObra = obraAtual == null ? null : agenda.stream().filter(a -> obraAtual.equals(a.idObra())).map(TurnoObraResponses.AgendaDoDia::numeroObra)
                    .findFirst().orElseGet(() -> obraRepository.findById(obraAtual).map(o -> o.getNumero()).orElse(null));
            OffsetDateTime ultimaAtividade = maisRecente(maisRecente(ultimaChegada != null ? ultimaChegada.getCampo().momentoConfiavel() : null,
                    ultimaSaida != null ? ultimaSaida.getCampo().momentoConfiavel() : null), turno != null ? ultimoApontamento.get(turno) : null);
            int aprsPendentes = (int) agenda.stream().filter(a -> a.liberacao() == SituacaoLiberacao.PENDENTE || a.liberacao() == SituacaoLiberacao.EM_PREENCHIMENTO).count();
            int concluidas = (int) agenda.stream().filter(a -> a.itens() > 0 && a.itensConcluidos() >= a.itens()).count();
            return new StatusEquipe(e.idEquipe(), e.codigo(), e.baseOperacional(), status, status.rotulo(), turno, obraAtual, numeroObra,
                    agenda.size(), concluidas, aprsPendentes, imp.size(), ultimaAtividade, e.lider() != null ? e.lider().nome() : null);
        }).sorted(Comparator.comparing((StatusEquipe s) -> s.status().ordinal()).thenComparing(StatusEquipe::codigo)).toList();
    }

    private static PresencaObra ultima(List<PresencaObra> presencas, PresencaObra.Tipo tipo) {
        return presencas.stream().filter(p -> p.getTipo() == tipo)
                .max(Comparator.comparing(p -> p.getCampo().momentoConfiavel())).orElse(null);
    }

    private static OffsetDateTime maisRecente(OffsetDateTime a, OffsetDateTime b) {
        if (a == null) {
            return b;
        }
        return b == null || a.isAfter(b) ? a : b;
    }
}
