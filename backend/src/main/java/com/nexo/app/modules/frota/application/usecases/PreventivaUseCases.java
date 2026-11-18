package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.frota.application.dto.AbrirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.AbrirOsPreventivaRequest;
import com.nexo.app.modules.frota.application.dto.AcompanhamentoPreventivaFilter;
import com.nexo.app.modules.frota.application.dto.AcompanhamentoPreventivaResponse;
import com.nexo.app.modules.frota.application.dto.ControlePreventivoResponse;
import com.nexo.app.modules.frota.application.dto.CorretivaPorItemResponse;
import com.nexo.app.modules.frota.application.dto.InformarRealizacaoPreventivaRequest;
import com.nexo.app.modules.frota.application.dto.OrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.OsPreventivaAbertaResponse;
import com.nexo.app.modules.frota.application.dto.PreventivaVeiculoResponse;
import com.nexo.app.modules.frota.application.dto.RealizacaoPreventivaResponse;
import com.nexo.app.modules.frota.domain.AvaliacaoPreventiva;
import com.nexo.app.modules.frota.domain.ControlePreventivo;
import com.nexo.app.modules.frota.domain.Criticidade;
import com.nexo.app.modules.frota.domain.FichaVeiculo;
import com.nexo.app.modules.frota.domain.ItemManutencao;
import com.nexo.app.modules.frota.domain.Medidas;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.PlanoPreventivo;
import com.nexo.app.modules.frota.domain.RealizacaoPreventiva;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoPreventiva;
import com.nexo.app.modules.frota.domain.SituacaoRealizacaoPreventiva;
import com.nexo.app.modules.frota.domain.TipoManutencao;
import com.nexo.app.modules.frota.infrastructure.persistence.ControlePreventivoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PlanoPreventivoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RealizacaoPreventivaRepository;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.events.FrotaPreventivaProximaEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Acompanhamento da preventiva: a situação de cada plano em cada veículo, a realização
 * informada, a OS preventiva aberta pelo acompanhamento (ou sozinha) e os avisos.
 *
 * <p>A situação é calculada na leitura (veja {@link AvaliacaoPreventiva}); o recorte da tela
 * (veículos × planos, na casa das centenas) é avaliado e ordenado em memória.</p>
 */
@Service
@RequiredArgsConstructor
public class PreventivaUseCases {

    static final String LINK = "/frota/preventiva";
    static final String FILTRO_COM_OS = "COM_OS";
    static final String FILTRO_SEM_HISTORICO = "SEM_HISTORICO";
    /** Janela da média de uso diária da previsão e o mínimo de dias entre leituras para confiar nela. */
    static final int DIAS_USO = 60;
    static final int DIAS_MINIMOS_USO = 7;
    static final int MAXIMO_DIAS_CORRETIVAS = 731;
    private static final int LIMITE_DESCRICAO_OS = 2000;

    private final ControlePreventivoRepository controles;
    private final RealizacaoPreventivaRepository realizacoes;
    private final PlanoPreventivoRepository planos;
    private final FichaVeiculoRepository fichas;
    private final OrdemServicoRepository ordens;
    private final SincronizacaoPreventiva sincronizacao;
    private final OdometroUseCases odometro;
    private final OrdemServicoUseCases ordensServico;
    private final ReferenciasFrota referencias;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * Controle avaliado agora, com a ficha do veículo. O cálculo usa o acumulado; {@code medicao}
     * guarda também o painel em uso, para a tela mostrar o número que se lê no veículo.
     */
    record Avaliado(ControlePreventivo controle, FichaVeiculo ficha, AvaliacaoPreventiva avaliacao,
                    OdometroUseCases.MedicaoAcumulada medicao) {

        /** Quanto subtrair do acumulado para chegar ao painel em uso (zero sem troca de painel). */
        long deslocamento() {
            return medicao == null ? 0 : medicao.deslocamento();
        }

        Long medicaoNoPainel() {
            return medicao == null ? null : medicao.painel();
        }

        Long proximaNoPainel() {
            return avaliacao.proximaMedicao() == null ? null : avaliacao.proximaMedicao() - deslocamento();
        }

        /** A base no painel em uso; nula quando a realização foi no painel anterior (o número de lá não vale mais). */
        Long baseNoPainel() {
            Long base = controle.getBaseMedicao();
            if (base == null || deslocamento() == 0) return base;
            var inicio = medicao.inicioPainel();
            boolean noPainelAtual = inicio == null
                    || !controle.getBaseData().isBefore(inicio.atZoneSameInstant(LiberacaoCnhUseCases.FUSO).toLocalDate());
            return noPainelAtual && base >= deslocamento() ? base - deslocamento() : null;
        }

        boolean comOs() {
            return controle.temRealizacaoAberta();
        }

        /** Filtros rápidos em que a linha entra. "Com OS" tira a linha de vencida/próxima/em dia. */
        Set<String> filtros() {
            if (comOs()) return Set.of(FILTRO_COM_OS);
            var filtros = new HashSet<String>();
            filtros.add(avaliacao.situacao().name());
            if (controle.isSemHistorico()) filtros.add(FILTRO_SEM_HISTORICO);
            return filtros;
        }

        int urgencia() {
            if (comOs()) return 2;
            return switch (avaliacao.situacao()) {
                case VENCIDA -> 0;
                case PROXIMA -> 1;
                case EM_DIA -> 3;
            };
        }
    }

    // ── Consultas ──────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public AcompanhamentoPreventivaResponse acompanhamento(AcompanhamentoPreventivaFilter filtro, Pageable pageable) {
        var hoje = hoje();
        List<ControlePreventivo> lista = filtro.idVeiculo() != null
                ? controles.findAllByIdVeiculoAndAtivoTrue(filtro.idVeiculo())
                : controles.findAllByAtivoTrue();
        lista = lista.stream()
                .filter(c -> c.getPlano().isAtivo())
                .filter(c -> filtro.idPlano() == null || c.getPlano().getId().equals(filtro.idPlano()))
                .toList();
        Set<UUID> bases = filtro.idBase() == null || filtro.idBase().isEmpty() ? null : Set.copyOf(filtro.idBase());
        String placa = filtro.busca() == null || filtro.busca().isBlank() ? null
                : filtro.busca().replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        List<Avaliado> recorte = avaliar(lista, hoje).stream()
                .filter(a -> bases == null || bases.contains(a.ficha().getIdBaseOperacional()))
                .filter(a -> placa == null || a.ficha().getPlaca().replaceAll("[^A-Za-z0-9]", "").contains(placa))
                .toList();

        var contagens = new AcompanhamentoPreventivaResponse.Contagens(
                contar(recorte, SituacaoPreventiva.VENCIDA.name()), contar(recorte, SituacaoPreventiva.PROXIMA.name()),
                contar(recorte, FILTRO_COM_OS), contar(recorte, FILTRO_SEM_HISTORICO),
                contar(recorte, SituacaoPreventiva.EM_DIA.name()), recorte.size());

        Set<String> pedidos = filtro.situacao() == null ? Set.of() : filtro.situacao().stream()
                .filter(Objects::nonNull).map(s -> s.toUpperCase(Locale.ROOT)).collect(Collectors.toSet());
        List<Avaliado> filtrados = recorte.stream()
                .filter(a -> pedidos.isEmpty() || a.filtros().stream().anyMatch(pedidos::contains))
                .sorted(ordemDeUrgencia())
                .toList();

        int inicio = (int) Math.min((long) pageable.getPageNumber() * pageable.getPageSize(), filtrados.size());
        int fim = Math.min(inicio + pageable.getPageSize(), filtrados.size());
        var conteudo = montar(filtrados.subList(inicio, fim));
        return new AcompanhamentoPreventivaResponse(
                PageResponse.fromPage(new PageImpl<>(conteudo, pageable, filtrados.size())), contagens);
    }

    /** Aba Preventiva da ficha: planos que acompanham o veículo e todas as realizações dele. */
    @Transactional(readOnly = true)
    public PreventivaVeiculoResponse doVeiculo(UUID idVeiculo) {
        var ativos = controles.findAllByIdVeiculoAndAtivoTrue(idVeiculo).stream()
                .filter(c -> c.getPlano().isAtivo()).toList();
        var linhas = montar(avaliar(ativos, hoje()).stream().sorted(ordemDeUrgencia()).toList());
        var todos = controles.findAllByIdVeiculoIn(List.of(idVeiculo));
        var historico = realizacoes.findAllByControleIdInAndAtivoTrueOrderByDataCriacaoDesc(
                todos.stream().map(ControlePreventivo::getId).toList());
        return new PreventivaVeiculoResponse(linhas, montarRealizacoes(historico));
    }

    /** Planos próximos ou vencidos do veículo, para a situação do veículo no app. */
    @Transactional(readOnly = true)
    public List<ControlePreventivoResponse> pendentesDoVeiculo(UUID idVeiculo) {
        var ativos = controles.findAllByIdVeiculoAndAtivoTrue(idVeiculo).stream()
                .filter(c -> c.getPlano().isAtivo()).toList();
        return montar(avaliar(ativos, hoje()).stream()
                .filter(a -> a.avaliacao().situacao() != SituacaoPreventiva.EM_DIA)
                .sorted(ordemDeUrgencia()).toList());
    }

    /** Previsões no período (agenda da frota), das bases informadas (nulo = todas). */
    @Transactional(readOnly = true)
    public List<ControlePreventivoResponse> previsoes(LocalDate de, LocalDate ate, Set<UUID> idsBase) {
        var ativos = controles.findAllByAtivoTrue().stream().filter(c -> c.getPlano().isAtivo()).toList();
        return montar(avaliar(ativos, hoje()).stream()
                .filter(a -> !a.comOs() && a.avaliacao().previsao() != null)
                .filter(a -> !a.avaliacao().previsao().isBefore(de) && !a.avaliacao().previsao().isAfter(ate))
                .filter(a -> idsBase == null || idsBase.contains(a.ficha().getIdBaseOperacional()))
                .toList());
    }

    /**
     * Corretivas concluídas por item no período, com os planos ativos que já levam o item.
     * Sem período, os últimos 90 dias.
     */
    @Transactional(readOnly = true)
    public List<CorretivaPorItemResponse> corretivasPorItem(LocalDate de, LocalDate ate, Collection<UUID> idsBase,
                                                           Collection<UUID> idsTipoVeiculo) {
        var hoje = hoje();
        LocalDate fim = ate == null ? hoje : ate;
        LocalDate inicio = de == null ? fim.minusDays(90) : de;
        if (fim.isBefore(inicio)) {
            throw new InvarianteVioladaException("A data final não pode ser antes da inicial.");
        }
        if (ChronoUnit.DAYS.between(inicio, fim) > MAXIMO_DIAS_CORRETIVAS) {
            throw new InvarianteVioladaException("Consulte no máximo dois anos por vez.");
        }
        boolean todasBases = idsBase == null || idsBase.isEmpty();
        boolean todosTipos = idsTipoVeiculo == null || idsTipoVeiculo.isEmpty();
        var linhas = ordens.contarCorretivasPorItem(
                inicio.atStartOfDay(LiberacaoCnhUseCases.FUSO).toOffsetDateTime(),
                fim.plusDays(1).atStartOfDay(LiberacaoCnhUseCases.FUSO).toOffsetDateTime(),
                todasBases, todasBases ? List.of(new UUID(0, 0)) : idsBase,
                todosTipos, todosTipos ? List.of(new UUID(0, 0)) : idsTipoVeiculo);
        Map<UUID, List<String>> planosPorItem = new HashMap<>();
        for (PlanoPreventivo plano : planos.findAllByAtivoTrue()) {
            for (ItemManutencao item : plano.getItens()) {
                planosPorItem.computeIfAbsent(item.getId(), k -> new ArrayList<>()).add(plano.getNome());
            }
        }
        return linhas.stream().map(l -> new CorretivaPorItemResponse(l.getIdItem(), l.getItem(), l.getOrdens(),
                l.getVeiculos(), l.getValor(), l.getUltima(),
                planosPorItem.getOrDefault(l.getIdItem(), List.of()).stream().sorted().toList())).toList();
    }

    /** Controles vencidos e próximos de um veículo. */
    public record PendenciaPreventiva(long vencidas, long proximas) {
    }

    /** Por veículo, os controles ativos vencidos e próximos hoje (relatórios gerenciais). */
    @Transactional(readOnly = true)
    public Map<UUID, PendenciaPreventiva> pendenciasPorVeiculo() {
        Map<UUID, PendenciaPreventiva> porVeiculo = new HashMap<>();
        var ativos = controles.findAllByAtivoTrue().stream().filter(c -> c.getPlano().isAtivo()).toList();
        for (Avaliado a : avaliar(ativos, hoje())) {
            boolean vencida = a.filtros().contains(SituacaoPreventiva.VENCIDA.name());
            boolean proxima = a.filtros().contains(SituacaoPreventiva.PROXIMA.name());
            if (!vencida && !proxima) continue;
            porVeiculo.merge(a.ficha().getIdVeiculo(), new PendenciaPreventiva(vencida ? 1 : 0, proxima ? 1 : 0),
                    (x, y) -> new PendenciaPreventiva(x.vencidas() + y.vencidas(), x.proximas() + y.proximas()));
        }
        return porVeiculo;
    }

    // ── Ações ──────────────────────────────────────────────────────────────────────

    /** Revisão feita fora do sistema: vira a base do ciclo. A medição vem no valor do painel. */
    @Transactional
    public ControlePreventivoResponse informarRealizacao(UUID idControle, InformarRealizacaoPreventivaRequest request) {
        var controle = buscarControle(idControle);
        var ficha = fichas.findByIdVeiculo(controle.getIdVeiculo())
                .orElseThrow(() -> new RecursoNaoEncontradoException("Veículo não encontrado na frota."));
        var atual = odometro.medicoesAtuais(List.of(ficha.getIdVeiculo())).get(ficha.getIdVeiculo());
        Long medicaoAtual = atual != null && atual.unidade() == ficha.getUnidadeMedicao() ? atual.acumulado() : null;
        // Quem informa lê o painel: a conferência e a mensagem usam o painel em uso, não o acumulado.
        boolean noPainelAtual = atual == null || atual.inicioPainel() == null || request.data() == null
                || !request.data().isBefore(atual.inicioPainel().atZoneSameInstant(LiberacaoCnhUseCases.FUSO).toLocalDate());
        if (medicaoAtual != null && request.medicao() != null && noPainelAtual && request.medicao() > atual.painel()) {
            throw new InvarianteVioladaException("A medição informada passa a atual do veículo ("
                    + Medidas.formatar(atual.painel(), ficha.getUnidadeMedicao()) + ").");
        }
        // Long no ramo do acumulado: com o primitivo, o ternário desembrulharia a medição nula (plano só por data).
        Long medicao = request.medicao() == null || request.data() == null ? request.medicao()
                : (Long) odometro.acumuladoEm(ficha.getIdVeiculo(), request.medicao(),
                request.data().atTime(LocalTime.MAX).atZone(LiberacaoCnhUseCases.FUSO).toOffsetDateTime());
        RealizacaoPreventiva realizacao = controle.informarRealizacao(request.data(), medicao, medicaoAtual,
                ficha.getUnidadeMedicao(), request.observacao(), hoje(), SecurityUtils.getUsuarioLogadoId());
        realizacoes.save(realizacao);
        controles.save(controle);
        return montar(avaliar(List.of(controle), hoje())).get(0);
    }

    /** OS preventiva dos controles escolhidos: uma por veículo, com os itens e o roteiro dos planos. */
    @Transactional
    public OsPreventivaAbertaResponse abrirOs(AbrirOsPreventivaRequest request) {
        if (!SecurityUtils.possuiAutoridade("frota:os:write")) {
            throw new AccessDeniedException("Abrir OS exige a permissão de lançar ordens de serviço.");
        }
        var escolhidos = controles.findAllByIdIn(request.idsControle());
        if (escolhidos.size() != new HashSet<>(request.idsControle()).size()) {
            throw new RecursoNaoEncontradoException("Algum plano escolhido não foi encontrado.");
        }
        return abrir(escolhidos, SecurityUtils.getUsuarioLogadoId());
    }

    // ── Job diário ─────────────────────────────────────────────────────────────────

    @Transactional
    public int sincronizarFrota() {
        return sincronizacao.sincronizar(null);
    }

    /**
     * Controles de plano com abertura automática que estão próximos ou vencidos sem OS,
     * agrupados por veículo: cada grupo vira uma OS (o job abre um de cada vez).
     */
    @Transactional(readOnly = true)
    public List<List<UUID>> pendentesDeAberturaAutomatica(LocalDate hoje) {
        var ativos = controles.findAllByAtivoTrue().stream()
                .filter(c -> c.getPlano().isAtivo() && c.getPlano().isAbrirOsAutomaticamente()).toList();
        Map<UUID, List<UUID>> porVeiculo = new LinkedHashMap<>();
        for (Avaliado a : avaliar(ativos, hoje)) {
            if (!a.comOs() && a.avaliacao().situacao() != SituacaoPreventiva.EM_DIA) {
                porVeiculo.computeIfAbsent(a.controle().getIdVeiculo(), k -> new ArrayList<>()).add(a.controle().getId());
            }
        }
        return List.copyOf(porVeiculo.values());
    }

    /** Abertura pelo sistema (sem usuário), chamada pelo job para um veículo. */
    @Transactional
    public OsPreventivaAbertaResponse abrirAutomaticamente(List<UUID> idsControle) {
        return abrir(controles.findAllByIdIn(idsControle), null);
    }

    /** Publica o aviso de cada etapa (próxima, vencida) ainda não avisada no ciclo. */
    @Transactional
    public int avisar(LocalDate hoje) {
        var ativos = controles.findAllByAtivoTrue().stream().filter(c -> c.getPlano().isAtivo()).toList();
        var pendentes = avaliar(ativos, hoje).stream()
                .filter(a -> !a.comOs() && a.avaliacao().situacao() != SituacaoPreventiva.EM_DIA)
                .filter(a -> a.controle().precisaAvisar(a.avaliacao().situacao()))
                .toList();
        if (pendentes.isEmpty()) return 0;
        Map<UUID, String> nomesBases = referencias.nomesBases(pendentes.stream()
                .map(a -> a.ficha().getIdBaseOperacional()).filter(Objects::nonNull).collect(Collectors.toSet()));
        for (Avaliado a : pendentes) {
            var situacao = a.avaliacao().situacao();
            eventPublisher.publishEvent(new FrotaPreventivaProximaEvent(a.controle().getId(), a.ficha().getPlaca(),
                    a.controle().getPlano().getNome(), situacao.getRotulo().toLowerCase(Locale.ROOT),
                    a.avaliacao().falta(), nomesBases.get(a.ficha().getIdBaseOperacional()),
                    LINK + "?situacao=" + situacao.name()));
            a.controle().registrarAviso(situacao, hoje);
        }
        controles.saveAll(pendentes.stream().map(Avaliado::controle).toList());
        return pendentes.size();
    }

    // ── Internos ───────────────────────────────────────────────────────────────────

    private OsPreventivaAbertaResponse abrir(List<ControlePreventivo> escolhidos, UUID idUsuario) {
        if (escolhidos.isEmpty()) {
            throw new InvarianteVioladaException("Escolha ao menos um plano.");
        }
        Map<UUID, Long> numerosAbertos = numerosOs(escolhidos);
        Map<UUID, FichaVeiculo> fichasPorVeiculo = fichas.findAllByIdVeiculoIn(
                        escolhidos.stream().map(ControlePreventivo::getIdVeiculo).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(FichaVeiculo::getIdVeiculo, Function.identity()));
        for (ControlePreventivo c : escolhidos) {
            FichaVeiculo ficha = fichasPorVeiculo.get(c.getIdVeiculo());
            String placa = ficha == null ? "" : ficha.getPlaca();
            if (!c.isAtivo() || !c.getPlano().isAtivo()) {
                throw new InvarianteVioladaException("O plano " + c.getPlano().getNome() + " não acompanha mais o veículo " + placa + ".");
            }
            if (c.temRealizacaoAberta()) {
                Long numero = numerosAbertos.get(c.getId());
                throw new InvarianteVioladaException("O plano " + c.getPlano().getNome() + " do veículo " + placa
                        + " já tem a OS " + (numero == null ? "" : numero + " ") + "aberta.");
            }
        }
        Map<UUID, List<ControlePreventivo>> porVeiculo = escolhidos.stream()
                .sorted(Comparator.comparing((ControlePreventivo c) -> fichasPorVeiculo.get(c.getIdVeiculo()).getPlaca())
                        .thenComparing(c -> c.getPlano().getNome()))
                .collect(Collectors.groupingBy(ControlePreventivo::getIdVeiculo, LinkedHashMap::new, Collectors.toList()));

        var abertas = new ArrayList<OsPreventivaAbertaResponse.Ordem>();
        for (var grupo : porVeiculo.entrySet()) {
            FichaVeiculo ficha = fichasPorVeiculo.get(grupo.getKey());
            List<PlanoPreventivo> planosDoGrupo = grupo.getValue().stream().map(ControlePreventivo::getPlano).toList();
            Criticidade criticidade = planosDoGrupo.stream().map(PlanoPreventivo::getCriticidade)
                    .min(Comparator.naturalOrder()).orElse(Criticidade.MEDIA);
            List<UUID> idsItem = planosDoGrupo.stream().flatMap(p -> p.getItens().stream())
                    .filter(ItemManutencao::isAtivo).map(ItemManutencao::getId).distinct().toList();
            if (idsItem.isEmpty()) {
                throw new InvarianteVioladaException("Os itens de manutenção do plano estão desativados. Revise o plano "
                        + planosDoGrupo.get(0).getNome() + ".");
            }
            // Já existe preventiva do veículo esperando a oficina: o plano entra nela, uma ida só.
            var existente = ordens.findAllByIdVeiculoAndSituacaoInAndAtivoTrueOrderByAbertaEmDesc(ficha.getIdVeiculo(),
                            List.of(SituacaoOrdemServico.PENDENTE, SituacaoOrdemServico.AGENDADA)).stream()
                    .filter(OrdemServico::aceitaOutraPreventiva).findFirst();
            String nomesPlanos = planosDoGrupo.stream().map(PlanoPreventivo::getNome).collect(Collectors.joining(", "));
            OrdemServicoResponse os;
            if (existente.isPresent()) {
                var todosPlanos = new ArrayList<PlanoPreventivo>(realizacoes.findAllByIdOrdemServicoAndSituacaoAndAtivoTrue(
                                existente.get().getId(), SituacaoRealizacaoPreventiva.ABERTA).stream()
                        .map(r -> r.getControle().getPlano()).toList());
                todosPlanos.addAll(planosDoGrupo);
                os = ordensServico.incluirPreventiva(existente.get().getId(), idsItem, descricaoOs(todosPlanos),
                        criticidade, nomesPlanos).ordem();
            } else {
                os = ordensServico.abrir(new AbrirOrdemServicoRequest(ficha.getIdVeiculo(), TipoManutencao.PREVENTIVA,
                        OrigemOrdemServico.PREVENTIVA, criticidade, null, descricaoOs(planosDoGrupo), idsItem,
                        null, null, null, null, null, null, false)).ordem();
            }
            for (ControlePreventivo controle : grupo.getValue()) {
                var realizacao = realizacoes.saveAndFlush(
                        RealizacaoPreventiva.porOrdemServico(controle, os.id(), ficha.getUnidadeMedicao(), idUsuario));
                controle.vincularRealizacao(realizacao);
                controles.save(controle);
            }
            abertas.add(new OsPreventivaAbertaResponse.Ordem(os.id(), os.numero(), ficha.getPlaca(),
                    planosDoGrupo.stream().map(PlanoPreventivo::getNome).toList(), existente.isPresent()));
        }
        return new OsPreventivaAbertaResponse(abertas);
    }

    /** "Preventiva: A, B" e o roteiro de cada plano, cortado no limite da descrição da OS. */
    static String descricaoOs(List<PlanoPreventivo> planosDoGrupo) {
        var texto = new StringBuilder("Preventiva: ")
                .append(planosDoGrupo.stream().map(PlanoPreventivo::getNome).collect(Collectors.joining(", ")))
                .append('.');
        for (PlanoPreventivo plano : planosDoGrupo) {
            if (plano.getTarefas().isEmpty()) continue;
            texto.append("\n\nRoteiro").append(planosDoGrupo.size() > 1 ? " de " + plano.getNome() : "").append(":\n")
                    .append(plano.roteiroNumerado());
        }
        if (texto.length() <= LIMITE_DESCRICAO_OS) return texto.toString();
        return texto.substring(0, LIMITE_DESCRICAO_OS - 1) + "…";
    }

    List<Avaliado> avaliar(Collection<ControlePreventivo> lista, LocalDate hoje) {
        if (lista.isEmpty()) return List.of();
        var idsVeiculo = lista.stream().map(ControlePreventivo::getIdVeiculo).collect(Collectors.toSet());
        Map<UUID, FichaVeiculo> fichasPorVeiculo = fichas.findAllByIdVeiculoIn(idsVeiculo).stream()
                .collect(Collectors.toMap(FichaVeiculo::getIdVeiculo, Function.identity()));
        var medicoes = odometro.medicoesAtuais(idsVeiculo);
        var uso = odometro.usoDiario(idsVeiculo, hoje.minusDays(DIAS_USO).atStartOfDay(LiberacaoCnhUseCases.FUSO)
                .toOffsetDateTime(), DIAS_MINIMOS_USO);
        var avaliados = new ArrayList<Avaliado>();
        for (ControlePreventivo controle : lista) {
            FichaVeiculo ficha = fichasPorVeiculo.get(controle.getIdVeiculo());
            if (ficha == null) continue;
            var medicao = medicoes.get(ficha.getIdVeiculo());
            if (medicao != null && medicao.unidade() != ficha.getUnidadeMedicao()) medicao = null;
            Long atual = medicao == null ? null : medicao.acumulado();
            avaliados.add(new Avaliado(controle, ficha, AvaliacaoPreventiva.avaliar(controle, atual,
                    ficha.getUnidadeMedicao(), hoje, uso.get(ficha.getIdVeiculo())), medicao));
        }
        return avaliados;
    }

    private static Comparator<Avaliado> ordemDeUrgencia() {
        return Comparator.comparingInt(Avaliado::urgencia)
                .thenComparing(a -> a.avaliacao().previsao(), Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(a -> a.ficha().getPlaca())
                .thenComparing(a -> a.controle().getPlano().getNome());
    }

    private static long contar(List<Avaliado> recorte, String filtro) {
        return recorte.stream().filter(a -> a.filtros().contains(filtro)).count();
    }

    /** Número da OS aberta de cada controle. */
    private Map<UUID, Long> numerosOs(Collection<ControlePreventivo> lista) {
        var idsRealizacao = lista.stream().map(ControlePreventivo::getIdRealizacaoAberta).filter(Objects::nonNull).toList();
        if (idsRealizacao.isEmpty()) return Map.of();
        Map<UUID, UUID> osPorRealizacao = realizacoes.findAllByIdIn(idsRealizacao).stream()
                .filter(r -> r.getIdOrdemServico() != null)
                .collect(Collectors.toMap(RealizacaoPreventiva::getId, RealizacaoPreventiva::getIdOrdemServico));
        Map<UUID, Long> numeros = ordens.findAllById(osPorRealizacao.values()).stream()
                .collect(Collectors.toMap(o -> o.getId(), o -> o.getNumero()));
        var resultado = new HashMap<UUID, Long>();
        for (ControlePreventivo c : lista) {
            UUID os = c.getIdRealizacaoAberta() == null ? null : osPorRealizacao.get(c.getIdRealizacaoAberta());
            if (os != null && numeros.containsKey(os)) resultado.put(c.getId(), numeros.get(os));
        }
        return resultado;
    }

    private List<ControlePreventivoResponse> montar(List<Avaliado> avaliados) {
        if (avaliados.isEmpty()) return List.of();
        var controlesLista = avaliados.stream().map(Avaliado::controle).toList();
        var numeros = numerosOs(controlesLista);
        var idsRealizacao = controlesLista.stream().map(ControlePreventivo::getIdRealizacaoAberta).filter(Objects::nonNull).toList();
        Map<UUID, UUID> osPorRealizacao = idsRealizacao.isEmpty() ? Map.of() : realizacoes.findAllByIdIn(idsRealizacao).stream()
                .filter(r -> r.getIdOrdemServico() != null)
                .collect(Collectors.toMap(RealizacaoPreventiva::getId, RealizacaoPreventiva::getIdOrdemServico));
        Map<UUID, String> nomesBases = referencias.nomesBases(avaliados.stream()
                .map(a -> a.ficha().getIdBaseOperacional()).filter(Objects::nonNull).collect(Collectors.toSet()));
        return avaliados.stream().map(a -> {
            var c = a.controle();
            var av = a.avaliacao();
            var plano = c.getPlano();
            return new ControlePreventivoResponse(c.getId(), c.getIdVeiculo(), a.ficha().getPlaca(),
                    nomesBases.get(a.ficha().getIdBaseOperacional()), plano.getId(), plano.getNome(),
                    plano.frequenciaDescrita(), av.situacao(), av.situacao().getRotulo(), c.isSemHistorico(),
                    av.unidade(), a.medicaoNoPainel(), c.getBaseData(), a.baseNoPainel(), c.getBaseOrigem(),
                    c.getBaseOrigem().getRotulo(), a.proximaNoPainel(), av.faltaMedicao(), av.proximaData(),
                    av.faltaDias(), av.previsao(), av.falta(),
                    c.getIdRealizacaoAberta() == null ? null : osPorRealizacao.get(c.getIdRealizacaoAberta()),
                    numeros.get(c.getId()));
        }).toList();
    }

    private List<RealizacaoPreventivaResponse> montarRealizacoes(List<RealizacaoPreventiva> lista) {
        if (lista.isEmpty()) return List.of();
        var idsOs = lista.stream().map(RealizacaoPreventiva::getIdOrdemServico).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, Long> numeros = idsOs.isEmpty() ? Map.of() : ordens.findAllById(idsOs).stream()
                .collect(Collectors.toMap(o -> o.getId(), o -> o.getNumero()));
        Map<UUID, String> logins = referencias.loginsUsuarios(lista.stream()
                .map(RealizacaoPreventiva::getIdUsuario).filter(Objects::nonNull).collect(Collectors.toSet()));
        return lista.stream().map(r -> new RealizacaoPreventivaResponse(r.getId(), r.getControle().getId(),
                r.getControle().getPlano().getNome(), r.getOrigem(), r.getOrigem().getRotulo(), r.getSituacao(),
                r.getSituacao().getRotulo(), r.getRealizadaEm(), medicaoNoPainel(r), r.getUnidade(), r.getObservacao(),
                r.getIdOrdemServico(), r.getIdOrdemServico() == null ? null : numeros.get(r.getIdOrdemServico()),
                r.getIdUsuario() == null ? (r.getIdOrdemServico() == null ? null : "Sistema") : logins.get(r.getIdUsuario()),
                r.getDataCriacao())).toList();
    }

    /** A realização guarda o acumulado; o histórico mostra o painel daquele dia (tirando as trocas até ali). */
    private Long medicaoNoPainel(RealizacaoPreventiva r) {
        if (r.getMedicao() == null || r.getRealizadaEm() == null) return r.getMedicao();
        long deslocamento = odometro.acumuladoEm(r.getControle().getIdVeiculo(), 0,
                r.getRealizadaEm().atTime(LocalTime.MAX).atZone(LiberacaoCnhUseCases.FUSO).toOffsetDateTime());
        return Math.max(0, r.getMedicao() - deslocamento);
    }

    private ControlePreventivo buscarControle(UUID id) {
        return controles.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Plano do veículo não encontrado."));
    }

    private static LocalDate hoje() {
        return LocalDate.now(LiberacaoCnhUseCases.FUSO);
    }
}
