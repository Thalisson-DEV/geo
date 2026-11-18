package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.obras.application.dto.EventoProgramacaoFilter;
import com.nexo.app.modules.obras.application.dto.ProgramacaoResponses;
import com.nexo.app.modules.obras.domain.EventoProgramacao;
import com.nexo.app.modules.obras.domain.Programacao;
import com.nexo.app.modules.obras.domain.SituacaoProgramacao;
import com.nexo.app.modules.obras.domain.TipoEventoProgramacao;
import com.nexo.app.modules.obras.domain.TurnoProgramacao;
import com.nexo.app.modules.obras.infrastructure.persistence.EventoProgramacaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.EventoProgramacaoSpecification;
import com.nexo.app.modules.obras.infrastructure.persistence.ProgramacaoRepository;
import com.nexo.app.modules.rh.JanelaMetaFaturamento;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Painel gerencial da programação: o que foi programado no período, quanto virou execução, o que mudou e por quê,
 * quem está ocupado ou livre e o que falta programar. Só lê: parte da mesma linha do tempo do Gantt.
 */
@Service
@RequiredArgsConstructor
public class PainelProgramacaoObras {

    private static final BigDecimal CEM = BigDecimal.valueOf(100);
    private static final int DIAS_A_FRENTE = 14;
    private static final int LIMITE_SERIE_DIARIA = 45;
    private static final int LIMITE_LISTAS = 8;

    private final ConsultarProgramacoesObra consultas;
    private final ProgramacaoRepository repository;
    private final EventoProgramacaoRepository eventoRepository;

    @Transactional(readOnly = true)
    public ProgramacaoResponses.Painel painel(LocalDate inicio, LocalDate fim, UUID idBase, UUID idTipoEquipe) {
        LocalDate hoje = LocalDate.now();
        ProgramacaoResponses.Gantt gantt = consultas.gantt(inicio, fim, idBase, idTipoEquipe, null);
        Map<UUID, BigDecimal> realizado = repository.listarNoPeriodoComItens(inicio, fim).stream()
                .collect(Collectors.toMap(Programacao::getId, Programacao::valorRealizado, (a, b) -> a));

        List<ProgramacaoResponses.BarraGantt> todas = gantt.equipes().stream().flatMap(l -> l.programacoes().stream()).toList();
        List<ProgramacaoResponses.BarraGantt> validas = todas.stream().filter(b -> b.situacao() != SituacaoProgramacao.CANCELADA).toList();
        Set<UUID> equipesDoRecorte = gantt.equipes().stream().map(ProgramacaoResponses.LinhaGantt::idEquipe).collect(Collectors.toSet());
        boolean recortado = idBase != null || idTipoEquipe != null;

        List<EventoProgramacao> eventos = eventoRepository.findAll(EventoProgramacaoSpecification.filterBy(
                        new EventoProgramacaoFilter(null, null, null, null, null, null, null, inicio, fim, null, null))).stream()
                .filter(e -> !recortado || equipesDoRecorte.contains(e.getIdEquipeOrigem()) || equipesDoRecorte.contains(e.getIdEquipeDestino()))
                .toList();
        Map<TipoEventoProgramacao, Long> porTipo = eventos.stream().collect(Collectors.groupingBy(EventoProgramacao::getTipo, Collectors.counting()));
        Map<UUID, Long> reprogramacoesPorEquipe = eventos.stream()
                .filter(e -> e.getTipo() == TipoEventoProgramacao.REPROGRAMADA && e.getIdEquipeOrigem() != null)
                .collect(Collectors.groupingBy(EventoProgramacao::getIdEquipeOrigem, Collectors.counting()));

        int diasUteis = JanelaMetaFaturamento.diasUteis(inicio, fim);
        List<ProgramacaoResponses.EquipePainel> equipes = gantt.equipes().stream()
                .map(linha -> equipe(linha, inicio, fim, diasUteis, realizado, hoje, reprogramacoesPorEquipe.getOrDefault(linha.idEquipe(), 0L).intValue()))
                .sorted(Comparator.comparing(ProgramacaoResponses.EquipePainel::ocupacao, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(ProgramacaoResponses.EquipePainel::codigo))
                .toList();

        int vencidas = (int) validas.stream().filter(b -> b.fim().isBefore(hoje)).count();
        int cumpridas = (int) validas.stream().filter(b -> b.fim().isBefore(hoje) && b.situacao() == SituacaoProgramacao.CONCLUIDA).count();
        BigDecimal valorProgramado = soma(validas, ProgramacaoResponses.BarraGantt::valor);
        BigDecimal valorRealizado = soma(validas, b -> realizado.getOrDefault(b.id(), BigDecimal.ZERO));
        int livres = (int) equipes.stream().filter(e -> e.programacoes() == 0).count();
        ProgramacaoResponses.TotaisPainel totais = new ProgramacaoResponses.TotaisPainel(
                validas.size(), contar(todas, SituacaoProgramacao.PROGRAMADA), contar(todas, SituacaoProgramacao.EM_ANDAMENTO),
                contar(todas, SituacaoProgramacao.ATRASADA), contar(todas, SituacaoProgramacao.CONCLUIDA), contar(todas, SituacaoProgramacao.CANCELADA),
                vencidas, percentual(BigDecimal.valueOf(cumpridas), BigDecimal.valueOf(vencidas)),
                valorProgramado, valorRealizado, percentual(valorRealizado, valorProgramado),
                quantos(porTipo, TipoEventoProgramacao.CRIADA), quantos(porTipo, TipoEventoProgramacao.EDITADA),
                quantos(porTipo, TipoEventoProgramacao.REPROGRAMADA), quantos(porTipo, TipoEventoProgramacao.CANCELADA),
                quantos(porTipo, TipoEventoProgramacao.EXCLUIDA),
                equipes.size(), livres, diasUteis, media(equipes.stream().map(ProgramacaoResponses.EquipePainel::ocupacao).toList()),
                (int) validas.stream().filter(ProgramacaoResponses.BarraGantt::linhaViva).count(),
                (int) validas.stream().filter(ProgramacaoResponses.BarraGantt::desligamento).count());

        boolean diaria = ChronoUnit.DAYS.between(inicio, fim) < LIMITE_SERIE_DIARIA;
        List<ProgramacaoResponses.ObraAProgramar> aProgramar = consultas.obrasAProgramar(idBase);
        List<ProgramacaoResponses.BarraGantt> atrasadas = new ArrayList<>(gantt.atrasadasAntes());
        todas.stream().filter(b -> b.situacao() == SituacaoProgramacao.ATRASADA).forEach(atrasadas::add);

        return new ProgramacaoResponses.Painel(inicio, fim, OffsetDateTime.now(), totais, equipes, bases(equipes),
                diaria ? "DIA" : "SEMANA", serie(validas, realizado, inicio, fim, diaria), proximosDias(hoje, idBase, idTipoEquipe),
                motivos(eventos), obrasInstaveis(eventos),
                atrasadas.stream().distinct().sorted(Comparator.comparing(ProgramacaoResponses.BarraGantt::fim)).limit(LIMITE_LISTAS).toList(),
                aProgramar.size(), soma(aProgramar, ProgramacaoResponses.ObraAProgramar::valorPendente),
                aProgramar.stream().limit(LIMITE_LISTAS).toList());
    }

    private static ProgramacaoResponses.EquipePainel equipe(ProgramacaoResponses.LinhaGantt linha, LocalDate inicio, LocalDate fim, int diasUteis,
                                                            Map<UUID, BigDecimal> realizado, LocalDate hoje, int reprogramacoes) {
        List<ProgramacaoResponses.BarraGantt> validas = linha.programacoes().stream().filter(b -> b.situacao() != SituacaoProgramacao.CANCELADA).toList();
        Map<LocalDate, List<TurnoProgramacao>> turnosPorDia = new TreeMap<>();
        for (ProgramacaoResponses.BarraGantt b : validas) {
            LocalDate de = b.inicio().isBefore(inicio) ? inicio : b.inicio();
            LocalDate ate = b.fim().isAfter(fim) ? fim : b.fim();
            for (LocalDate dia = de; !dia.isAfter(ate); dia = dia.plusDays(1)) {
                if (JanelaMetaFaturamento.diaUtil(dia)) {
                    turnosPorDia.computeIfAbsent(dia, d -> new ArrayList<>()).add(b.turno());
                }
            }
        }
        int sobreposicoes = (int) turnosPorDia.values().stream().filter(PainelProgramacaoObras::sobrepoe).count();
        return new ProgramacaoResponses.EquipePainel(linha.idEquipe(), linha.codigo(), linha.tipoEquipe(), linha.base(), validas.size(),
                (int) validas.stream().filter(b -> b.situacao() == SituacaoProgramacao.CONCLUIDA).count(),
                (int) validas.stream().filter(b -> b.situacao() == SituacaoProgramacao.ATRASADA).count(),
                (int) linha.programacoes().stream().filter(b -> b.situacao() == SituacaoProgramacao.CANCELADA).count(),
                reprogramacoes,
                soma(validas, ProgramacaoResponses.BarraGantt::valor),
                soma(validas, b -> realizado.getOrDefault(b.id(), BigDecimal.ZERO)),
                turnosPorDia.size(), percentual(BigDecimal.valueOf(turnosPorDia.size()), BigDecimal.valueOf(diasUteis)),
                linha.percentualMeta(), sobreposicoes);
    }

    /** Dois no mesmo dia só se cruzam se um for o dia todo ou se forem do mesmo turno. */
    private static boolean sobrepoe(List<TurnoProgramacao> turnos) {
        return turnos.size() > 1 && (turnos.contains(TurnoProgramacao.DIA_TODO) || new HashSet<>(turnos).size() < turnos.size());
    }

    private static List<ProgramacaoResponses.BasePainel> bases(List<ProgramacaoResponses.EquipePainel> equipes) {
        Map<String, List<ProgramacaoResponses.EquipePainel>> porBase = equipes.stream()
                .collect(Collectors.groupingBy(e -> e.base() != null ? e.base() : "Sem base", LinkedHashMap::new, Collectors.toList()));
        return porBase.entrySet().stream()
                .map(e -> new ProgramacaoResponses.BasePainel(e.getKey(), e.getValue().size(),
                        (int) e.getValue().stream().filter(x -> x.programacoes() == 0).count(),
                        e.getValue().stream().mapToInt(ProgramacaoResponses.EquipePainel::programacoes).sum(),
                        e.getValue().stream().mapToInt(ProgramacaoResponses.EquipePainel::atrasadas).sum(),
                        soma(e.getValue(), ProgramacaoResponses.EquipePainel::valorProgramado),
                        soma(e.getValue(), ProgramacaoResponses.EquipePainel::valorRealizado),
                        media(e.getValue().stream().map(ProgramacaoResponses.EquipePainel::ocupacao).toList())))
                .sorted(Comparator.comparing(ProgramacaoResponses.BasePainel::valorProgramado).reversed())
                .toList();
    }

    private static List<ProgramacaoResponses.PontoSeriePainel> serie(List<ProgramacaoResponses.BarraGantt> validas, Map<UUID, BigDecimal> realizado,
                                                                     LocalDate inicio, LocalDate fim, boolean diaria) {
        Function<LocalDate, LocalDate> balde = diaria ? d -> d : d -> d.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        Map<LocalDate, List<ProgramacaoResponses.BarraGantt>> porBalde = new TreeMap<>();
        for (LocalDate d = balde.apply(inicio); !d.isAfter(fim); d = diaria ? d.plusDays(1) : d.plusWeeks(1)) {
            porBalde.put(d, new ArrayList<>());
        }
        for (ProgramacaoResponses.BarraGantt b : validas) {
            LocalDate inicioNoPeriodo = b.inicio().isBefore(inicio) ? inicio : b.inicio();
            porBalde.computeIfAbsent(balde.apply(inicioNoPeriodo), d -> new ArrayList<>()).add(b);
        }
        return porBalde.entrySet().stream()
                .map(e -> new ProgramacaoResponses.PontoSeriePainel(e.getKey(), e.getValue().size(),
                        (int) e.getValue().stream().filter(b -> b.situacao() == SituacaoProgramacao.CONCLUIDA).count(),
                        soma(e.getValue(), ProgramacaoResponses.BarraGantt::valor),
                        soma(e.getValue(), b -> realizado.getOrDefault(b.id(), BigDecimal.ZERO))))
                .toList();
    }

    /** Os próximos dias, de hoje em diante, independentes do período escolhido: é a agenda que ainda dá para mexer. */
    private List<ProgramacaoResponses.DiaPainel> proximosDias(LocalDate hoje, UUID idBase, UUID idTipoEquipe) {
        LocalDate ate = hoje.plusDays(DIAS_A_FRENTE - 1L);
        ProgramacaoResponses.Gantt agenda = consultas.gantt(hoje, ate, idBase, idTipoEquipe, null);
        int totalEquipes = agenda.equipes().size();
        List<ProgramacaoResponses.DiaPainel> dias = new ArrayList<>();
        for (LocalDate dia = hoje; !dia.isAfter(ate); dia = dia.plusDays(1)) {
            LocalDate d = dia;
            List<ProgramacaoResponses.BarraGantt> doDia = agenda.equipes().stream()
                    .flatMap(l -> l.programacoes().stream())
                    .filter(b -> b.situacao() != SituacaoProgramacao.CANCELADA && b.situacao() != SituacaoProgramacao.CONCLUIDA)
                    .filter(b -> !b.inicio().isAfter(d) && !b.fim().isBefore(d))
                    .toList();
            int ocupadas = (int) doDia.stream().map(ProgramacaoResponses.BarraGantt::idEquipe).distinct().count();
            dias.add(new ProgramacaoResponses.DiaPainel(d, JanelaMetaFaturamento.diaUtil(d), doDia.size(), ocupadas,
                    Math.max(totalEquipes - ocupadas, 0),
                    (int) doDia.stream().filter(ProgramacaoResponses.BarraGantt::linhaViva).count(),
                    (int) doDia.stream().filter(ProgramacaoResponses.BarraGantt::desligamento).count(),
                    (int) doDia.stream().map(ProgramacaoResponses.BarraGantt::idObra).distinct().count()));
        }
        return dias;
    }

    /** Motivos repetidos dizem mais que motivos soltos: agrupa pelo texto, sem diferenciar maiúsculas e espaços. */
    private static List<ProgramacaoResponses.MotivoPainel> motivos(List<EventoProgramacao> eventos) {
        record Chave(TipoEventoProgramacao tipo, String texto) {
        }
        Map<Chave, List<EventoProgramacao>> grupos = eventos.stream()
                .filter(e -> e.getTipo() == TipoEventoProgramacao.REPROGRAMADA || e.getTipo() == TipoEventoProgramacao.CANCELADA
                        || e.getTipo() == TipoEventoProgramacao.EXCLUIDA)
                .filter(e -> e.getObservacao() != null && !e.getObservacao().isBlank())
                .collect(Collectors.groupingBy(e -> new Chave(e.getTipo(), e.getObservacao().trim().replaceAll("\\s+", " ").toLowerCase())));
        return grupos.values().stream()
                .map(lista -> new ProgramacaoResponses.MotivoPainel(lista.getFirst().getTipo(), lista.getFirst().getObservacao().trim(), lista.size()))
                .sorted(Comparator.comparingInt(ProgramacaoResponses.MotivoPainel::quantidade).reversed()
                        .thenComparing(ProgramacaoResponses.MotivoPainel::motivo))
                .limit(LIMITE_LISTAS + 2L)
                .toList();
    }

    private static List<ProgramacaoResponses.ObraInstavelPainel> obrasInstaveis(List<EventoProgramacao> eventos) {
        Map<UUID, List<EventoProgramacao>> porObra = eventos.stream()
                .filter(e -> e.getTipo() == TipoEventoProgramacao.REPROGRAMADA || e.getTipo() == TipoEventoProgramacao.CANCELADA)
                .collect(Collectors.groupingBy(EventoProgramacao::getIdObra));
        return porObra.entrySet().stream()
                .map(e -> new ProgramacaoResponses.ObraInstavelPainel(e.getKey(), e.getValue().getFirst().getNumeroObra(),
                        (int) e.getValue().stream().filter(x -> x.getTipo() == TipoEventoProgramacao.REPROGRAMADA).count(),
                        (int) e.getValue().stream().filter(x -> x.getTipo() == TipoEventoProgramacao.CANCELADA).count(),
                        (int) e.getValue().stream().filter(x -> x.getTipo() == TipoEventoProgramacao.REPROGRAMADA
                                && !Objects.equals(x.getIdEquipeOrigem(), x.getIdEquipeDestino())).count()))
                .sorted(Comparator.comparingInt((ProgramacaoResponses.ObraInstavelPainel o) -> o.reprogramacoes() + o.cancelamentos()).reversed()
                        .thenComparing(ProgramacaoResponses.ObraInstavelPainel::numeroObra, Comparator.nullsLast(Comparator.naturalOrder())))
                .limit(LIMITE_LISTAS)
                .toList();
    }

    private static int contar(List<ProgramacaoResponses.BarraGantt> barras, SituacaoProgramacao situacao) {
        return (int) barras.stream().filter(b -> b.situacao() == situacao).count();
    }

    private static int quantos(Map<TipoEventoProgramacao, Long> porTipo, TipoEventoProgramacao tipo) {
        return porTipo.getOrDefault(tipo, 0L).intValue();
    }

    private static <T> BigDecimal soma(List<T> itens, Function<T, BigDecimal> valor) {
        return itens.stream().map(valor).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal percentual(BigDecimal parte, BigDecimal total) {
        return total == null || total.signum() == 0 ? null : parte.multiply(CEM).divide(total, 1, RoundingMode.HALF_UP);
    }

    private static BigDecimal media(List<BigDecimal> valores) {
        List<BigDecimal> presentes = valores.stream().filter(Objects::nonNull).toList();
        return presentes.isEmpty() ? null
                : presentes.stream().reduce(BigDecimal.ZERO, BigDecimal::add).divide(BigDecimal.valueOf(presentes.size()), 1, RoundingMode.HALF_UP);
    }
}
