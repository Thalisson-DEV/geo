package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.EstoqueRelatorioResponse;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraFilter;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraResponses;
import com.nexo.app.modules.estoque.application.dto.FechamentoRelatorioResponse;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoSolicitacao;
import com.nexo.app.modules.estoque.domain.SolicitacaoMaterial;
import com.nexo.app.modules.estoque.application.dto.MovimentacoesRelatorioResponse;
import com.nexo.app.modules.estoque.infrastructure.persistence.RelatorioAlmoxarifadoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.projections.MovimentacaoRelatorioProjection;
import com.nexo.app.modules.estoque.infrastructure.persistence.projections.SaldoRelatorioProjection;
import com.nexo.app.modules.iam.UsuarioApi;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.modules.rh.BaseOperacionalApi;
import com.nexo.app.modules.rh.BaseOperacionalResponse;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.modules.rh.ProcessoNegocioApi;
import com.nexo.app.modules.rh.ProcessoNegocioResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Dados dos relatórios gerenciais do almoxarifado: movimentações do período (com o período anterior de
 * mesma duração, para comparação) e a posição atual do estoque. Nomes de base, equipe, processo, obra e
 * operador são resolvidos aqui, uma vez por recorte, e não por linha no cliente.
 */
@Service
@RequiredArgsConstructor
public class RelatorioAlmoxarifadoUseCases {

    static final int LIMITE_MOVIMENTACOES = 40_000;
    static final int LIMITE_SALDOS = 30_000;
    private static final int LIMITE_OBRAS_RESOLVIDAS = 600;
    private static final int PERIODO_PADRAO_DIAS = 90;
    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private final RelatorioAlmoxarifadoRepository repository;
    private final BaseOperacionalApi baseApi;
    private final EquipeApi equipeApi;
    private final ProcessoNegocioApi processoApi;
    private final ObraApi obraApi;
    private final UsuarioApi usuarioApi;
    private final FechamentoObraUseCases fechamentoUseCases;

    @Transactional(readOnly = true)
    public MovimentacoesRelatorioResponse movimentacoes(LocalDate de, LocalDate ate) {
        LocalDate fim = ate != null ? ate : LocalDate.now(FUSO);
        LocalDate inicio = de != null ? de : fim.minusDays(PERIODO_PADRAO_DIAS - 1L);
        if (inicio.isAfter(fim)) {
            LocalDate troca = inicio;
            inicio = fim;
            fim = troca;
        }
        long dias = ChronoUnit.DAYS.between(inicio, fim) + 1;
        LocalDate anteriorAte = inicio.minusDays(1);
        LocalDate anteriorDe = anteriorAte.minusDays(dias - 1);

        List<MovimentacaoRelatorioProjection> atuais = repository.listarMovimentacoes(
                instante(inicio), instante(fim.plusDays(1)), LIMITE_MOVIMENTACOES + 1);
        List<MovimentacaoRelatorioProjection> anteriores = repository.listarMovimentacoes(
                instante(anteriorDe), instante(inicio), LIMITE_MOVIMENTACOES + 1);
        boolean truncado = atuais.size() > LIMITE_MOVIMENTACOES || anteriores.size() > LIMITE_MOVIMENTACOES;
        if (atuais.size() > LIMITE_MOVIMENTACOES) atuais = atuais.subList(0, LIMITE_MOVIMENTACOES);
        if (anteriores.size() > LIMITE_MOVIMENTACOES) anteriores = anteriores.subList(0, LIMITE_MOVIMENTACOES);

        List<MovimentacaoRelatorioProjection> todas = Stream.concat(atuais.stream(), anteriores.stream()).toList();
        Nomes nomes = new Nomes(
                todas.stream().map(MovimentacaoRelatorioProjection::getIdBase).toList(),
                todas.stream().map(MovimentacaoRelatorioProjection::getIdEquipe).toList(),
                atuais.stream().map(MovimentacaoRelatorioProjection::getIdObra).toList(),
                todas.stream().map(MovimentacaoRelatorioProjection::getIdOperador).toList());

        List<MovimentacoesRelatorioResponse.Linha> linhas = new ArrayList<>(todas.size());
        atuais.forEach(m -> linhas.add(linha(m, false, nomes)));
        anteriores.forEach(m -> linhas.add(linha(m, true, nomes)));

        return new MovimentacoesRelatorioResponse(OffsetDateTime.now(FUSO), inicio, fim, anteriorDe, anteriorAte,
                LIMITE_MOVIMENTACOES, truncado, linhas);
    }

    @Transactional(readOnly = true)
    public EstoqueRelatorioResponse estoque() {
        List<SaldoRelatorioProjection> saldos = repository.listarSaldos(LIMITE_SALDOS + 1);
        boolean truncado = saldos.size() > LIMITE_SALDOS;
        if (truncado) saldos = saldos.subList(0, LIMITE_SALDOS);
        Nomes nomes = new Nomes(
                saldos.stream().map(SaldoRelatorioProjection::getIdBase).toList(),
                saldos.stream().map(SaldoRelatorioProjection::getIdEquipe).toList(),
                saldos.stream().map(SaldoRelatorioProjection::getIdObra).toList(),
                List.of());
        List<EstoqueRelatorioResponse.Saldo> linhas = saldos.stream().map(s -> {
            Equipe eq = nomes.equipe(s.getIdEquipe());
            return new EstoqueRelatorioResponse.Saldo(
                    s.getIdEstoque(), s.getEstoque(), s.getTipoEstoque(),
                    s.getIdBase(), nomes.base(s.getIdBase()),
                    s.getIdEquipe(), eq == null ? null : eq.codigo(),
                    eq == null ? null : eq.idProcesso(), eq == null ? null : eq.processo(),
                    s.getIdObra(), nomes.obra(s.getIdObra()),
                    s.getIdMaterial(), s.getCodigo(), s.getDescricao(), s.getUnidade(),
                    Boolean.TRUE.equals(s.getDetalhaSerie()), s.getCondicao(), decimal(s.getQuantidade()),
                    inteiro(s.getSeries()), inteiro(s.getSeriesReservadas()),
                    data(s.getUltimaEntrada()), data(s.getUltimaSaida()), data(s.getDesde()));
        }).toList();
        return new EstoqueRelatorioResponse(OffsetDateTime.now(FUSO), LIMITE_SALDOS, truncado, linhas);
    }

    /**
     * Encerramento de obras: as solicitações criadas no período e as ainda em andamento de antes dele, pelo
     * mesmo recorte da lista do fechamento (prazos em horas úteis).
     */
    @Transactional(readOnly = true)
    public FechamentoRelatorioResponse fechamento(LocalDate de, LocalDate ate) {
        LocalDate fim = ate != null ? ate : LocalDate.now(FUSO);
        LocalDate inicio = de != null ? de : fim.minusDays(PERIODO_PADRAO_DIAS - 1L);
        if (inicio.isAfter(fim)) {
            LocalDate troca = inicio;
            inicio = fim;
            fim = troca;
        }
        List<FechamentoRelatorioResponse.Linha> linhas = new ArrayList<>();
        fechamentoUseCases.percorrerRecorte(filtroFechamento(null, inicio, fim), (s, r) -> linhas.add(linhaFechamento(s, r, false)));
        List<SituacaoFechamentoSolicitacao> andamento = List.of(SituacaoFechamentoSolicitacao.AGUARDANDO_RESERVA,
                SituacaoFechamentoSolicitacao.AGUARDANDO_MOVIMENTACAO, SituacaoFechamentoSolicitacao.MOVIMENTADA_PARCIALMENTE);
        fechamentoUseCases.percorrerRecorte(filtroFechamento(andamento, null, inicio.minusDays(1)),
                (s, r) -> linhas.add(linhaFechamento(s, r, true)));
        return new FechamentoRelatorioResponse(OffsetDateTime.now(FUSO), inicio, fim, linhas);
    }

    private static FechamentoObraFilter filtroFechamento(List<SituacaoFechamentoSolicitacao> situacoes, LocalDate de, LocalDate ate) {
        return new FechamentoObraFilter(null, null, null, situacoes, null, null, null, null, null, null, null,
                null, de, ate, null, null, null);
    }

    private static FechamentoRelatorioResponse.Linha linhaFechamento(SolicitacaoMaterial s, FechamentoObraResponses.Resumo r, boolean anterior) {
        FechamentoObraResponses.Obra obra = r.obra();
        FechamentoObraResponses.Pessoa sol = r.solicitante();
        FechamentoObraResponses.Pessoa enc = r.encarregado();
        FechamentoObraResponses.Pessoa sup = r.supervisor();
        FechamentoObraResponses.Pessoa coo = r.coordenador();
        FechamentoObraResponses.Estoque alm = r.almoxarifadoAtendimento();
        var motivo = s.getMotivoPendencia();
        return new FechamentoRelatorioResponse.Linha(
                r.id(), r.tipo(),
                obra == null ? s.getIdObra() : obra.id(), obra == null ? null : obra.numero(), obra == null ? null : obra.titulo(),
                s.getTipoObraSnapshot() == null ? null : s.getTipoObraSnapshot().name(),
                r.situacao(), r.situacaoObra(),
                r.prazoVigente() == null ? null : r.prazoVigente().situacao(),
                r.prazoVigente() == null ? null : r.prazoVigente().limite(),
                r.criadaEm(), s.getPrazoReservaAte(), s.getReservaCumpridaEm(), s.getPrazoMovimentacaoAte(),
                s.getMovimentacaoConcluidaEm(), s.getCanceladaEm(), r.numeroReserva(), r.possuiPendencia(),
                motivo == null ? null : motivo.getNome(),
                sol == null ? null : sol.id(), sol == null ? null : sol.nome(),
                enc == null ? null : enc.id(), enc == null ? null : enc.nome(),
                sup == null ? null : sup.id(), sup == null ? null : sup.nome(),
                coo == null ? null : coo.id(), coo == null ? null : coo.nome(),
                alm == null ? null : alm.id(), alm == null ? null : alm.nome(),
                r.totalItens(), r.quantidadeSolicitada(), r.quantidadeMovimentada(), anterior);
    }

    // ------------------------------------------------------------------ linhas

    private MovimentacoesRelatorioResponse.Linha linha(MovimentacaoRelatorioProjection m, boolean anterior, Nomes nomes) {
        Equipe eq = nomes.equipe(m.getIdEquipe());
        UUID idBase = m.getIdBase() != null ? m.getIdBase() : eq == null ? null : eq.idBase();
        return new MovimentacoesRelatorioResponse.Linha(
                m.getId(), m.getIdOperacao(), data(m.getDataHora()), anterior,
                m.getTipo(), m.getCondicao(), m.getMotivo(), anterior ? null : m.getObservacao(),
                decimal(m.getQuantidade()),
                m.getIdMaterial(), m.getCodigo(), m.getDescricao(), m.getUnidade(), anterior ? null : m.getNumSerie(),
                m.getIdOrigem(), m.getOrigem(), m.getTipoOrigem(),
                m.getIdDestino(), m.getDestino(), m.getTipoDestino(),
                idBase, nomes.base(idBase),
                m.getIdEquipe(), eq == null ? null : eq.codigo(),
                eq == null ? null : eq.idProcesso(), eq == null ? null : eq.processo(),
                m.getIdObra(), anterior ? null : nomes.obra(m.getIdObra()),
                m.getIdSolicitacao(), m.getContexto(), m.getTipoTecnico(),
                m.getIdOperador(), nomes.operador(m.getIdOperador()));
    }

    // ------------------------------------------------------------------ nomes

    private record Equipe(String codigo, UUID idBase, UUID idProcesso, String processo) {
    }

    /** Resolve os nomes de um recorte de uma só vez. */
    private final class Nomes {
        private final Map<UUID, String> bases = new HashMap<>();
        private final Map<UUID, Equipe> equipes = new HashMap<>();
        private final Map<UUID, String> obras = new HashMap<>();
        private final Map<UUID, String> operadores = new HashMap<>();

        Nomes(Collection<UUID> idsBase, Collection<UUID> idsEquipe, Collection<UUID> idsObra, Collection<UUID> idsOperador) {
            Map<UUID, String> processos = new HashMap<>();
            for (EquipeResponse e : equipeApi.listarEquipesAtivas()) {
                ProcessoNegocioResponse p = e.processo();
                if (p != null) processos.put(p.id(), p.nome());
                equipes.put(e.id(), new Equipe(e.codigo(),
                        e.baseOperacional() == null ? null : e.baseOperacional().id(),
                        p == null ? null : p.id(), p == null ? null : p.nome()));
            }
            distintos(idsEquipe).filter(id -> !equipes.containsKey(id)).forEach(id ->
                    equipeApi.buscarPublicaPorId(id).ifPresent(e -> equipes.put(id, new Equipe(e.codigo(),
                            e.idBaseOperacional(), e.idProcesso(),
                            e.idProcesso() == null ? null : processos.computeIfAbsent(e.idProcesso(),
                                    k -> processoApi.buscarPorIdResponse(k).map(ProcessoNegocioResponse::nome).orElse(null))))));

            List<UUID> ids = Stream.concat(distintos(idsBase),
                    equipes.values().stream().map(Equipe::idBase).filter(Objects::nonNull)).distinct().toList();
            if (!ids.isEmpty()) {
                baseApi.buscarPorIdsResponse(ids).forEach((id, b) -> bases.put(id, nomeBase(b)));
            }
            distintos(idsObra).limit(LIMITE_OBRAS_RESOLVIDAS)
                    .forEach(id -> obraApi.buscarPorId(id).ifPresent(o -> obras.put(id, o.numero())));
            distintos(idsOperador)
                    .forEach(id -> usuarioApi.buscarNomePorId(id).ifPresent(n -> operadores.put(id, n)));
        }

        String base(UUID id) {
            return id == null ? null : bases.get(id);
        }

        Equipe equipe(UUID id) {
            return id == null ? null : equipes.get(id);
        }

        String obra(UUID id) {
            return id == null ? null : obras.get(id);
        }

        String operador(UUID id) {
            return id == null ? null : operadores.get(id);
        }
    }

    private static String nomeBase(BaseOperacionalResponse b) {
        return b == null ? null : b.nome();
    }

    private static Stream<UUID> distintos(Collection<UUID> ids) {
        return ids.stream().filter(Objects::nonNull).distinct();
    }

    // ------------------------------------------------------------------ conversões

    private static String instante(LocalDate dia) {
        return dia.atStartOfDay(FUSO).toOffsetDateTime().toString();
    }

    private static OffsetDateTime data(Long epochMs) {
        return epochMs == null ? null : OffsetDateTime.ofInstant(Instant.ofEpochMilli(epochMs), FUSO);
    }

    private static BigDecimal decimal(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static int inteiro(Long v) {
        return v == null ? 0 : v.intValue();
    }
}
