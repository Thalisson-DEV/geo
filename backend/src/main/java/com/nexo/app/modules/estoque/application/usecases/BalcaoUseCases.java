package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.BalcaoRequests;
import com.nexo.app.modules.estoque.application.dto.BalcaoResponses;
import com.nexo.app.modules.estoque.application.dto.ConfirmarEntregaTecnicaRequest;
import com.nexo.app.modules.estoque.application.services.AlocacaoObraService;
import com.nexo.app.modules.estoque.application.services.ComprovanteBalcaoService;
import com.nexo.app.modules.estoque.application.services.DebitoSaldoService;
import com.nexo.app.modules.estoque.domain.AlocacaoObra;
import com.nexo.app.modules.estoque.domain.AtendimentoBalcao;
import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.ItemSolicitacao;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque.TipoMovimentacao;
import com.nexo.app.modules.estoque.domain.OrigemComandoTecnico;
import com.nexo.app.modules.estoque.domain.ParametrosEstoque;
import com.nexo.app.modules.estoque.domain.Saldo;
import com.nexo.app.modules.estoque.domain.SaldoSerie;
import com.nexo.app.modules.estoque.domain.SolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.StatusSeparacao;
import com.nexo.app.modules.estoque.infrastructure.persistence.AlocacaoObraRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.AtendimentoBalcaoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MovimentacaoEstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoSerieRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SolicitacaoMaterialRepository;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.modules.rh.ColaboradorApi;
import com.nexo.app.modules.rh.EquipeApi;
import com.nexo.app.modules.rh.EquipeMembroResponse;
import com.nexo.app.modules.rh.EquipeResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static com.nexo.app.shared.infrastructure.config.CacheNames.SALDOS;

/**
 * Balcão do almoxarifado: a rotina diária das equipes num lugar só. De manhã a equipe retira de uma vez o material
 * de todas as suas solicitações do dia; no fim do dia devolve o que sobrou no caminhão (novo e sucata), já sugerido
 * pelo sistema. Cada atendimento guarda quem retirou ou devolveu (matrícula), a assinatura e a foto.
 */
@Service
@RequiredArgsConstructor
public class BalcaoUseCases {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    private static final String FISICO = "FISICO";
    private static final int DIAS_EQUIPES_ATENDIDAS = 30;

    private final ParametrosEstoqueUseCases parametrosUseCases;
    private final SolicitacaoMaterialRepository solicitacaoRepository;
    private final MovimentacaoEstoqueRepository movimentacaoRepository;
    private final EstoqueRepository estoqueRepository;
    private final SaldoRepository saldoRepository;
    private final SaldoSerieRepository serieRepository;
    private final AlocacaoObraRepository alocacaoRepository;
    private final MaterialRepository materialRepository;
    private final AtendimentoBalcaoRepository atendimentoRepository;
    private final AlocacaoObraService alocacao;
    private final DebitoSaldoService debitoSaldoService;
    private final ComprovanteBalcaoService comprovantes;
    private final OperacaoSolicitacaoTecnicaUseCases operacoes;
    private final SeparacaoSolicitacaoTecnicaUseCases separacao;
    private final EquipeApi equipeApi;
    private final ColaboradorApi colaboradorApi;
    private final ObraApi obraApi;

    // ── Consultas ─────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public BalcaoResponses.Painel painel(UUID idAlmoxarifado, LocalDate data) {
        LocalDate dia = data == null ? LocalDate.now(FUSO) : data;
        List<Estoque> almoxarifados = estoqueRepository.findAllByTipoEstoqueNomeOrderByNomeIdentificadorAsc(FISICO).stream()
                .filter(Estoque::isAtivo).toList();
        Estoque almox = idAlmoxarifado != null ? almoxarifado(idAlmoxarifado) : escolherAlmoxarifado(almoxarifados, dia);
        BalcaoResponses.Parametros parametros = ParametrosEstoqueUseCases.toResponse(parametrosUseCases.obter());
        List<BalcaoResponses.Almoxarifado> opcoes = almoxarifados.stream()
                .map(e -> new BalcaoResponses.Almoxarifado(e.getId(), e.getNomeIdentificador())).toList();
        if (almox == null) {
            return new BalcaoResponses.Painel(null, null, dia, opcoes, parametros, List.of(), List.of());
        }

        Map<UUID, List<SolicitacaoMaterial>> retiradasPorEquipe = solicitacaoRepository
                .retiradasAbertasDoBalcao(almox.getId(), dia).stream()
                .filter(s -> s.getItens().stream().anyMatch(i -> i.getQuantidadePendente().signum() > 0))
                .collect(Collectors.groupingBy(SolicitacaoMaterial::getIdEquipeSaque));
        Set<UUID> idsEquipes = new LinkedHashSet<>(retiradasPorEquipe.keySet());
        idsEquipes.addAll(movimentacaoRepository.equipesAtendidasDesde(almox.getId(),
                OffsetDateTime.now(FUSO).minusDays(DIAS_EQUIPES_ATENDIDAS)));

        List<AtendimentoBalcao> semana = atendimentoRepository.doAlmoxarifadoDesde(almox.getId(),
                dia.minusDays(7).atStartOfDay(FUSO).toOffsetDateTime());
        semana.forEach(a -> idsEquipes.add(a.getIdEquipe()));

        Map<UUID, EquipeResponse> equipes = equipeApi.buscarPorIdsResponse(idsEquipes).stream()
                .filter(EquipeResponse::ativo)
                .collect(Collectors.toMap(EquipeResponse::id, e -> e, (a, b) -> a));

        List<BalcaoResponses.EquipeNoBalcao> fila = new ArrayList<>();
        for (EquipeResponse equipe : equipes.values()) {
            List<SolicitacaoMaterial> retiradas = retiradasPorEquipe.getOrDefault(equipe.id(), List.of());
            int itens = (int) retiradas.stream().flatMap(s -> s.getItens().stream())
                    .filter(i -> i.getQuantidadePendente().signum() > 0).count();
            ResumoCaminhao caminhao = resumirCaminhao(equipe.id());
            fila.add(new BalcaoResponses.EquipeNoBalcao(
                    equipe.id(), equipe.codigo(),
                    equipe.baseOperacional() == null ? null : equipe.baseOperacional().nome(),
                    encarregado(equipe),
                    retiradas.size(),
                    (int) retiradas.stream().map(SolicitacaoMaterial::getIdObra).filter(Objects::nonNull).distinct().count(),
                    itens,
                    retiradas.stream().anyMatch(s -> s.getDataPrevistaRetirada().isBefore(dia)),
                    retiradas.stream().anyMatch(s -> s.getStatusSeparacao() != StatusSeparacao.SEPARADO),
                    caminhao.itens(), caminhao.obras(), caminhao.sucatas(), caminhao.negativos(),
                    ultima(semana, equipe.id(), AtendimentoBalcao.Tipo.RETIRADA),
                    ultima(semana, equipe.id(), AtendimentoBalcao.Tipo.DEVOLUCAO)));
        }
        // Quem tem retirada pendente primeiro (as atrasadas no topo); depois quem tem material no caminhão.
        fila.sort(Comparator
                .comparing((BalcaoResponses.EquipeNoBalcao e) -> e.itensRetirada() == 0)
                .thenComparing(e -> !e.retiradaAtrasada())
                .thenComparing(e -> e.itensNoCaminhao() == 0)
                .thenComparing(BalcaoResponses.EquipeNoBalcao::codigo));

        OffsetDateTime inicioDoDia = dia.atStartOfDay(FUSO).toOffsetDateTime();
        List<BalcaoResponses.AtendimentoResumo> hoje = semana.stream()
                .filter(a -> !a.getRealizadoEm().isBefore(inicioDoDia))
                .map(a -> resumo(a, equipes))
                .toList();
        return new BalcaoResponses.Painel(almox.getId(), almox.getNomeIdentificador(), dia, opcoes, parametros, fila, hoje);
    }

    @Transactional(readOnly = true)
    public BalcaoResponses.Atendimento atendimento(UUID idEquipe, UUID idAlmoxarifado, LocalDate data) {
        LocalDate dia = data == null ? LocalDate.now(FUSO) : data;
        Estoque almox = almoxarifado(idAlmoxarifado);
        EquipeResponse equipe = equipeApi.buscarPorIdResponse(idEquipe)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Equipe não encontrada."));

        List<SolicitacaoMaterial> retiradas = solicitacaoRepository.retiradasAbertasDoBalcao(almox.getId(), dia).stream()
                .filter(s -> idEquipe.equals(s.getIdEquipeSaque()))
                .filter(s -> s.getItens().stream().anyMatch(i -> i.getQuantidadePendente().signum() > 0))
                .sorted(Comparator.comparing(SolicitacaoMaterial::getDataPrevistaRetirada)
                        .thenComparing(s -> Objects.toString(s.getNumeroProgramacao(), "")))
                .toList();
        Set<UUID> idsObras = new HashSet<>();
        retiradas.forEach(s -> idsObras.add(s.getIdObra()));
        Estoque caminhao = estoqueRepository.findByIdEquipe(idEquipe).orElse(null);
        List<AlocacaoObra> alocacoes = caminhao == null ? List.of() : alocacaoRepository.listarDoLocal(caminhao.getId());
        alocacoes.forEach(a -> idsObras.add(a.getIdObra()));
        idsObras.remove(null);
        Map<UUID, ObraApi.ObraPublica> obras = new HashMap<>();
        idsObras.forEach(id -> obraApi.buscarPorId(id).ifPresent(o -> obras.put(id, o)));

        List<BalcaoResponses.RetiradaObra> listaRetiradas = retiradas.stream().map(s -> {
            ObraApi.ObraPublica obra = obras.get(s.getIdObra());
            List<BalcaoResponses.ItemRetirada> itens = s.getItens().stream()
                    .filter(i -> i.getQuantidadePendente().signum() > 0)
                    .sorted(Comparator.comparing(i -> i.getMaterial().getCodigo()))
                    .map(i -> new BalcaoResponses.ItemRetirada(i.getId(), i.getMaterial().getId(), i.getMaterial().getCodigo(),
                            i.getMaterial().getDescricao(), i.getMaterial().getUnidadeMedida(), i.getQuantidade(),
                            i.getQuantidadeEntregaLiquida(), i.getQuantidadePendente(), i.getMaterial().isDetalhaSerie(),
                            saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(almox.getId(), i.getMaterial().getId(), CondicaoMaterial.NOVO)
                                    .map(Saldo::getQuantidade).orElse(BigDecimal.ZERO)))
                    .toList();
            return new BalcaoResponses.RetiradaObra(s.getId(), s.getVersao(), s.getIdObra(),
                    obra == null ? null : obra.numero(), obra == null ? null : obra.titulo(), s.getNumeroProgramacao(),
                    s.getDataPrevistaRetirada(), s.getDataPrevistaRetirada().isBefore(dia),
                    s.getReserva() == null ? null : s.getReserva().getNumeroApi(),
                    s.getTipoTecnico() != null && s.getTipoTecnico().name().contains("CONCRETO"),
                    s.getStatusSeparacao() == null ? null : s.getStatusSeparacao().name(), itens);
        }).toList();

        List<AtendimentoBalcao> recentes = atendimentoRepository.recentesDaEquipe(idEquipe, PageRequest.of(0, 10));
        Map<UUID, EquipeResponse> equipes = Map.of(equipe.id(), equipe);
        return new BalcaoResponses.Atendimento(equipe.id(), equipe.codigo(),
                equipe.baseOperacional() == null ? null : equipe.baseOperacional().nome(),
                almox.getId(), almox.getNomeIdentificador(),
                ParametrosEstoqueUseCases.toResponse(parametrosUseCases.obter()),
                pessoas(equipe), listaRetiradas,
                caminhao == null ? List.of() : gruposDoCaminhao(caminhao, alocacoes, obras),
                recentes.stream().map(a -> resumo(a, equipes)).toList());
    }

    /**
     * Estoque das equipes: cada equipe com caminhão, o que ela tem agora (por obra, sucata, negativo) e o que tem a
     * retirar até a data em qualquer almoxarifado. É a visão gerencial da rotina.
     */
    @Transactional(readOnly = true)
    public List<BalcaoResponses.EquipeNoBalcao> estoqueDasEquipes(LocalDate data) {
        LocalDate dia = data == null ? LocalDate.now(FUSO) : data;
        Map<UUID, List<SolicitacaoMaterial>> retiradasPorEquipe = new HashMap<>();
        for (Estoque almox : estoqueRepository.findAllByTipoEstoqueNomeOrderByNomeIdentificadorAsc(FISICO)) {
            solicitacaoRepository.retiradasAbertasDoBalcao(almox.getId(), dia).stream()
                    .filter(s -> s.getItens().stream().anyMatch(i -> i.getQuantidadePendente().signum() > 0))
                    .forEach(s -> retiradasPorEquipe.computeIfAbsent(s.getIdEquipeSaque(), k -> new ArrayList<>()).add(s));
        }
        Set<UUID> idsEquipes = new LinkedHashSet<>(retiradasPorEquipe.keySet());
        estoqueRepository.findAllByTipoEstoqueNomeOrderByNomeIdentificadorAsc("CAMPO").stream()
                .filter(e -> e.isAtivo() && e.getIdEquipe() != null)
                .forEach(e -> idsEquipes.add(e.getIdEquipe()));
        List<BalcaoResponses.EquipeNoBalcao> lista = new ArrayList<>();
        for (EquipeResponse equipe : equipeApi.buscarPorIdsResponse(idsEquipes)) {
            if (!equipe.ativo()) {
                continue;
            }
            List<SolicitacaoMaterial> retiradas = retiradasPorEquipe.getOrDefault(equipe.id(), List.of());
            ResumoCaminhao caminhao = resumirCaminhao(equipe.id());
            if (retiradas.isEmpty() && caminhao.itens() == 0 && caminhao.negativos() == 0) {
                continue;
            }
            List<AtendimentoBalcao> recentes = atendimentoRepository.recentesDaEquipe(equipe.id(), PageRequest.of(0, 10));
            lista.add(new BalcaoResponses.EquipeNoBalcao(equipe.id(), equipe.codigo(),
                    equipe.baseOperacional() == null ? null : equipe.baseOperacional().nome(), encarregado(equipe),
                    retiradas.size(),
                    (int) retiradas.stream().map(SolicitacaoMaterial::getIdObra).filter(Objects::nonNull).distinct().count(),
                    (int) retiradas.stream().flatMap(s -> s.getItens().stream()).filter(i -> i.getQuantidadePendente().signum() > 0).count(),
                    retiradas.stream().anyMatch(s -> s.getDataPrevistaRetirada().isBefore(dia)),
                    retiradas.stream().anyMatch(s -> s.getStatusSeparacao() != StatusSeparacao.SEPARADO),
                    caminhao.itens(), caminhao.obras(), caminhao.sucatas(), caminhao.negativos(),
                    ultima(recentes, equipe.id(), AtendimentoBalcao.Tipo.RETIRADA),
                    ultima(recentes, equipe.id(), AtendimentoBalcao.Tipo.DEVOLUCAO)));
        }
        lista.sort(Comparator.comparing((BalcaoResponses.EquipeNoBalcao e) -> e.negativosNoCaminhao() == 0)
                .thenComparing(BalcaoResponses.EquipeNoBalcao::codigo));
        return lista;
    }

    /**
     * Tudo o que está nos caminhões, numa lista só (equipe × obra × material), para as visões por material e por
     * obra do estoque das equipes. Saldos negativos entram com quantidade negativa e sem obra.
     */
    @Transactional(readOnly = true)
    public List<BalcaoResponses.ItemNasEquipes> itensDasEquipes() {
        List<Estoque> caminhoes = estoqueRepository.findAllByTipoEstoqueNomeOrderByNomeIdentificadorAsc("CAMPO").stream()
                .filter(e -> e.isAtivo() && e.getIdEquipe() != null)
                .toList();
        Map<UUID, EquipeResponse> equipes = new HashMap<>();
        equipeApi.buscarPorIdsResponse(caminhoes.stream().map(Estoque::getIdEquipe).collect(Collectors.toSet()))
                .forEach(e -> equipes.put(e.id(), e));
        Map<UUID, ObraApi.ObraPublica> obras = new HashMap<>();
        List<BalcaoResponses.ItemNasEquipes> itens = new ArrayList<>();
        for (Estoque caminhao : caminhoes) {
            EquipeResponse equipe = equipes.get(caminhao.getIdEquipe());
            if (equipe == null || !equipe.ativo()) {
                continue;
            }
            List<AlocacaoObra> alocacoes = alocacaoRepository.listarDoLocal(caminhao.getId());
            alocacoes.stream().map(AlocacaoObra::getIdObra).filter(Objects::nonNull).distinct()
                    .filter(id -> !obras.containsKey(id))
                    .forEach(id -> obraApi.buscarPorId(id).ifPresent(o -> obras.put(id, o)));
            for (BalcaoResponses.GrupoCaminhao g : gruposDoCaminhao(caminhao, alocacoes, obras)) {
                for (BalcaoResponses.ItemCaminhao i : g.itens()) {
                    itens.add(new BalcaoResponses.ItemNasEquipes(equipe.id(), equipe.codigo(), g.idObra(), g.numeroObra(), g.tituloObra(),
                            i.idMaterial(), i.codigo(), i.descricao(), i.unidade(), i.condicao(), i.quantidade()));
                }
            }
            saldoRepository.findDiferentesDeZeroByEstoqueId(caminhao.getId()).stream()
                    .filter(s -> s.getQuantidade().signum() < 0)
                    .forEach(s -> itens.add(new BalcaoResponses.ItemNasEquipes(equipe.id(), equipe.codigo(), null, null, null,
                            s.getMaterial().getId(), s.getMaterial().getCodigo(), s.getMaterial().getDescricao(),
                            s.getMaterial().getUnidadeMedida(), s.getCondicao().name(), s.getQuantidade())));
        }
        return itens;
    }

    /** O caminhão de uma equipe por obra (livre por último). */
    @Transactional(readOnly = true)
    public List<BalcaoResponses.GrupoCaminhao> caminhaoPorObra(UUID idEquipe) {
        Estoque caminhao = estoqueRepository.findByIdEquipe(idEquipe)
                .orElseThrow(() -> new RecursoNaoEncontradoException("A equipe não tem caminhão (estoque de campo) cadastrado."));
        List<AlocacaoObra> alocacoes = alocacaoRepository.listarDoLocal(caminhao.getId());
        Map<UUID, ObraApi.ObraPublica> obras = new HashMap<>();
        alocacoes.stream().map(AlocacaoObra::getIdObra).filter(Objects::nonNull).distinct()
                .forEach(id -> obraApi.buscarPorId(id).ifPresent(o -> obras.put(id, o)));
        return gruposDoCaminhao(caminhao, alocacoes, obras);
    }

    @Transactional(readOnly = true)
    public Optional<ComprovanteBalcaoService.Arquivo> comprovante(UUID idAtendimento, String parte) {
        AtendimentoBalcao atendimento = atendimentoRepository.findById(idAtendimento)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Atendimento não encontrado."));
        return comprovantes.baixar("foto".equalsIgnoreCase(parte) ? atendimento.getFoto() : atendimento.getAssinatura());
    }

    @Transactional(readOnly = true)
    public BalcaoResponses.AtendimentoResumo buscarAtendimento(UUID idAtendimento) {
        AtendimentoBalcao atendimento = atendimentoRepository.findById(idAtendimento)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Atendimento não encontrado."));
        Map<UUID, EquipeResponse> equipes = equipeApi.buscarPorIdResponse(atendimento.getIdEquipe())
                .map(e -> Map.of(e.id(), e)).orElse(Map.of());
        return resumo(atendimento, equipes);
    }

    // ── Comandos ──────────────────────────────────────────────────────────────

    /** A equipe retira de uma vez o material de todas as solicitações informadas. Tudo ou nada. */
    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public BalcaoResponses.AtendimentoResumo registrarRetirada(UUID idEquipe, BalcaoRequests.RegistrarRetirada request) {
        ParametrosEstoque parametros = parametrosUseCases.obter();
        Estoque almox = almoxarifado(request.idAlmoxarifado());
        EquipeResponse equipe = equipeApi.buscarPorIdResponse(idEquipe)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Equipe não encontrada."));
        UUID operador = operador();
        Quem quem = resolverQuem(equipe, request.comprovante(), parametros);
        exigirComprovantes(request.comprovante(), parametros);

        AtendimentoBalcao atendimento = new AtendimentoBalcao(AtendimentoBalcao.Tipo.RETIRADA, idEquipe, almox.getId(),
                quem.idColaborador(), quem.nome(), quem.matricula(), request.comprovante().observacao(), operador);
        atendimento = atendimentoRepository.saveAndFlush(atendimento);
        String assinatura = comprovantes.guardarAssinatura(atendimento.getId(), request.comprovante().assinatura());
        String foto = comprovantes.guardarFoto(atendimento.getId(), request.comprovante().foto());
        atendimento.registrarComprovantes(assinatura, foto);

        Set<UUID> vistas = new HashSet<>();
        for (BalcaoRequests.RetiradaSolicitacao pedido : request.solicitacoes()) {
            if (!vistas.add(pedido.idSolicitacao())) {
                throw new InvarianteVioladaException("A mesma solicitação veio duas vezes na retirada.");
            }
            SolicitacaoMaterial solicitacao = solicitacaoRepository.findById(pedido.idSolicitacao())
                    .orElseThrow(() -> new RecursoNaoEncontradoException("Solicitação não encontrada."));
            String obra = numeroObra(solicitacao.getIdObra());
            if (!idEquipe.equals(solicitacao.getIdEquipeSaque())) {
                throw new InvarianteVioladaException("A retirada da obra " + obra + " é de outra equipe.");
            }
            if (solicitacao.getAlmoxarifadoAtendimento() == null
                    || !almox.getId().equals(solicitacao.getAlmoxarifadoAtendimento().getId())) {
                throw new InvarianteVioladaException("A retirada da obra " + obra + " sai de outro almoxarifado.");
            }
            if (solicitacao.getReserva() == null && !solicitacao.isExcecaoReserva()
                    && (pedido.numeroReserva() == null || pedido.numeroReserva().isBlank())) {
                throw new InvarianteVioladaException("Informe o número da reserva da obra " + obra + ".");
            }
            if (solicitacao.getStatusSeparacao() != StatusSeparacao.SEPARADO) {
                if (parametros.isSeparacaoObrigatoria()) {
                    throw new InvarianteVioladaException("O material da obra " + obra + " ainda não foi separado.");
                }
                separacao.pular(solicitacao.getId(), null, operador, "balcao-" + UUID.randomUUID());
                solicitacao = solicitacaoRepository.findById(pedido.idSolicitacao()).orElseThrow();
            }
            List<ConfirmarEntregaTecnicaRequest.ItemEntregaTecnicaRequest> itensEntrega = new ArrayList<>();
            for (BalcaoRequests.ItemRetirada itemPedido : pedido.itens()) {
                ItemSolicitacao item = solicitacao.getItens().stream()
                        .filter(i -> i.getId().equals(itemPedido.idItemSolicitacao()))
                        .findFirst()
                        .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado na retirada da obra " + obra + "."));
                BigDecimal excedente = itemPedido.quantidade().subtract(item.getQuantidadePendente());
                if (excedente.signum() > 0) {
                    if (!parametros.isEntregaAcimaPedido()) {
                        throw new InvarianteVioladaException("Falta entregar só " + texto(item.getQuantidadePendente()) + " "
                                + Objects.toString(item.getMaterial().getUnidadeMedida(), "") + " de "
                                + item.getMaterial().getDescricao() + " na obra " + obra + ".");
                    }
                    item.replanejar(item.getMaterial(), item.getQuantidade().add(excedente));
                } else {
                    excedente = BigDecimal.ZERO;
                }
                itensEntrega.add(new ConfirmarEntregaTecnicaRequest.ItemEntregaTecnicaRequest(
                        item.getId(), itemPedido.quantidade(), vazioParaNulo(itemPedido.numeroSerie())));
                atendimento.adicionarItem(new AtendimentoBalcao.Item(item.getMaterial().getId(), item.getMaterial().getCodigo(),
                        item.getMaterial().getDescricao(), item.getMaterial().getUnidadeMedida(), itemPedido.quantidade(),
                        CondicaoMaterial.NOVO.name(), solicitacao.getIdObra(), obra, vazioParaNulo(itemPedido.numeroSerie()),
                        null, excedente.signum() > 0 ? excedente : null,
                        excedente.signum() > 0 ? motivoExcedente(itemPedido.motivoExcedente()) : null));
            }
            solicitacaoRepository.saveAndFlush(solicitacao);
            operacoes.entregar(solicitacao.getId(), new ConfirmarEntregaTecnicaRequest(
                    null, idEquipe, quem.idColaborador(), quem.foraDaEquipe(),
                    ComprovanteBalcaoService.FISICA.equals(assinatura) ? ComprovanteBalcaoService.FISICA : "BALCAO",
                    assinatura == null ? ComprovanteBalcaoService.FISICA : assinatura,
                    itensEntrega, vazioParaNulo(pedido.numeroReserva()), null, null),
                    operador, OrigemComandoTecnico.UI);
        }
        atendimento = atendimentoRepository.save(atendimento);
        return resumo(atendimento, Map.of(equipe.id(), equipe));
    }

    /** A equipe devolve o que sobrou no caminhão, de qualquer obra, novo ou sucata. Tudo ou nada. */
    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public BalcaoResponses.AtendimentoResumo registrarDevolucao(UUID idEquipe, BalcaoRequests.RegistrarDevolucao request) {
        ParametrosEstoque parametros = parametrosUseCases.obter();
        Estoque almox = almoxarifado(request.idAlmoxarifado());
        EquipeResponse equipe = equipeApi.buscarPorIdResponse(idEquipe)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Equipe não encontrada."));
        Estoque caminhao = estoqueRepository.findByIdEquipe(idEquipe)
                .orElseThrow(() -> new InvarianteVioladaException("A equipe não tem caminhão (estoque de campo) cadastrado."));
        UUID operador = operador();
        Quem quem = resolverQuem(equipe, request.comprovante(), parametros);
        exigirComprovantes(request.comprovante(), parametros);

        AtendimentoBalcao atendimento = new AtendimentoBalcao(AtendimentoBalcao.Tipo.DEVOLUCAO, idEquipe, almox.getId(),
                quem.idColaborador(), quem.nome(), quem.matricula(), request.comprovante().observacao(), operador);
        atendimento = atendimentoRepository.saveAndFlush(atendimento);
        atendimento.registrarComprovantes(
                comprovantes.guardarAssinatura(atendimento.getId(), request.comprovante().assinatura()),
                comprovantes.guardarFoto(atendimento.getId(), request.comprovante().foto()));

        UUID referencia = UUID.randomUUID();
        UUID referenciaBaixa = UUID.randomUUID();
        Map<String, BigDecimal> somaPorMaterial = new HashMap<>();
        for (BalcaoRequests.ItemDevolucao item : request.itens()) {
            Material material = materialRepository.findById(item.idMaterial())
                    .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado."));
            CondicaoMaterial condicao = Objects.requireNonNullElse(item.condicao(), CondicaoMaterial.NOVO);
            boolean guardar = item.destino() != BalcaoRequests.Destino.DESCARTAR;
            String serie = vazioParaNulo(item.numeroSerie());
            if (material.isDetalhaSerie()) {
                if (serie == null || item.quantidade().compareTo(BigDecimal.ONE) != 0) {
                    throw new InvarianteVioladaException("O material " + material.getCodigo()
                            + " controla série: devolva uma série por linha, com quantidade 1.");
                }
                SaldoSerie saldoSerie = serieRepository
                        .findByEstoqueIdAndMaterialIdAndNumSerieAndCondicaoAndAtivoTrue(caminhao.getId(), material.getId(), serie, condicao)
                        .orElseThrow(() -> new InvarianteVioladaException("A série " + serie + " não está no caminhão da equipe."));
                saldoSerie.transferirPara(almox);
                if (!guardar) {
                    saldoSerie.desativar();
                }
                serieRepository.save(saldoSerie);
            }
            String chave = material.getId() + "|" + condicao;
            BigDecimal pedido = somaPorMaterial.merge(chave, item.quantidade(), BigDecimal::add);
            if (condicao == CondicaoMaterial.NOVO && !parametros.isDevolucaoAcimaCaminhao()) {
                BigDecimal fisico = saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(caminhao.getId(), material.getId(), condicao)
                        .map(Saldo::getQuantidade).orElse(BigDecimal.ZERO);
                if (fisico.compareTo(pedido) < 0) {
                    throw new InvarianteVioladaException("O caminhão tem só " + texto(fisico.max(BigDecimal.ZERO)) + " "
                            + Objects.toString(material.getUnidadeMedida(), "") + " de " + material.getDescricao() + ".");
                }
            }
            alocacao.liberar(caminhao, material, condicao, item.idObra(), item.quantidade());
            debitoSaldoService.debitar(caminhao, material, condicao, item.quantidade());
            if (guardar) {
                creditar(almox, material, condicao, item.quantidade());
            }
            MovimentacaoEstoque movimento = MovimentacaoEstoque.criarPorObra(caminhao, almox, material, item.quantidade(),
                    TipoMovimentacao.DEVOLUCAO, condicao, item.idObra(), item.idObra(), idEquipe, operador, referencia,
                    "Devolução no balcão" + (quem.nome() == null ? "" : " — " + quem.nome()));
            movimento.registrarSerie(serie);
            movimentacaoRepository.save(movimento);
            if (!guardar) {
                movimentacaoRepository.save(new MovimentacaoEstoque(almox, null, material, item.quantidade(),
                        TipoMovimentacao.BAIXA_AVULSA, condicao, operador, referenciaBaixa, serie, OffsetDateTime.now()));
            }
            atendimento.adicionarItem(new AtendimentoBalcao.Item(material.getId(), material.getCodigo(), material.getDescricao(),
                    material.getUnidadeMedida(), item.quantidade(), condicao.name(), item.idObra(),
                    item.idObra() == null ? null : numeroObra(item.idObra()), serie,
                    guardar ? BalcaoRequests.Destino.GUARDAR.name() : BalcaoRequests.Destino.DESCARTAR.name(), null, null));
        }
        atendimento.vincularReferencia(referencia);
        atendimento = atendimentoRepository.save(atendimento);
        return resumo(atendimento, Map.of(equipe.id(), equipe));
    }

    // ── Apoio ─────────────────────────────────────────────────────────────────

    private record Quem(UUID idColaborador, String nome, String matricula, boolean foraDaEquipe) {
    }

    private record ResumoCaminhao(int itens, int obras, int sucatas, int negativos) {
    }

    /**
     * Quem retira ou devolve: pela matrícula (o jeito do balcão) ou pelo colaborador escolhido. Membro da equipe ou,
     * com matrícula, alguém de fora (ex.: o supervisor que buscou o material).
     */
    /**
     * Quem retira ou devolve: a pessoa escolhida (da equipe ou de fora dela). A matrícula é a do cadastro do colaborador e
     * vai para o termo junto com o nome; com a regra "exige matrícula", quem não tem matrícula cadastrada não pode retirar.
     * A matrícula digitada (versões antigas do app) continua aceita para achar a pessoa.
     */
    private Quem resolverQuem(EquipeResponse equipe, BalcaoRequests.Comprovante comprovante, ParametrosEstoque parametros) {
        UUID idColaborador = comprovante.idColaborador();
        String matriculaDigitada = vazioParaNulo(comprovante.matricula());
        if (idColaborador == null && matriculaDigitada != null) {
            idColaborador = colaboradorApi.buscarIdPorMatricula(matriculaDigitada)
                    .orElseThrow(() -> new InvarianteVioladaException("Nenhum colaborador ativo com a matrícula " + matriculaDigitada.trim().toUpperCase() + "."));
        }
        if (idColaborador == null) {
            throw new InvarianteVioladaException("Escolha quem retira ou devolve.");
        }
        UUID id = idColaborador;
        String nome = colaboradorApi.buscarResumosPorIds(List.of(id)).values().stream()
                .findFirst().map(r -> r.nomeCompleto()).orElseThrow(() -> new InvarianteVioladaException("Colaborador não encontrado ou inativo."));
        String matricula = colaboradorApi.buscarMatriculasPorIds(List.of(id)).get(id);
        if (parametros.isExigeMatricula() && (matricula == null || matricula.isBlank())) {
            throw new InvarianteVioladaException(nome + " não tem matrícula no cadastro. Cadastre a matrícula em Colaboradores e tente de novo.");
        }
        boolean membro = equipe.membros() != null && equipe.membros().stream()
                .anyMatch(m -> m.vinculoAtivo() && id.equals(m.idColaborador()));
        return new Quem(id, nome, matricula, !membro);
    }

    private static void exigirComprovantes(BalcaoRequests.Comprovante comprovante, ParametrosEstoque parametros) {
        if (parametros.isExigeAssinatura() && vazioParaNulo(comprovante.assinatura()) == null) {
            throw new InvarianteVioladaException("Colha a assinatura de quem retira ou devolve (ou marque termo em papel).");
        }
        if (parametros.isExigeFoto() && vazioParaNulo(comprovante.foto()) == null) {
            throw new InvarianteVioladaException("Tire a foto de quem retira ou devolve.");
        }
    }

    private Estoque almoxarifado(UUID id) {
        if (id == null) {
            throw new InvarianteVioladaException("Escolha o almoxarifado.");
        }
        Estoque estoque = estoqueRepository.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Almoxarifado não encontrado."));
        if (!estoque.isAtivo() || estoque.getTipoEstoque() == null
                || !FISICO.equalsIgnoreCase(estoque.getTipoEstoque().getNome())) {
            throw new InvarianteVioladaException("Escolha um almoxarifado ativo.");
        }
        return estoque;
    }

    /** Sem escolha: o almoxarifado com mais retiradas no dia; sem nenhuma, o primeiro. */
    private Estoque escolherAlmoxarifado(List<Estoque> almoxarifados, LocalDate dia) {
        if (almoxarifados.isEmpty()) {
            return null;
        }
        return almoxarifados.stream()
                .max(Comparator.comparingInt(e -> solicitacaoRepository.retiradasAbertasDoBalcao(e.getId(), dia).size()))
                .filter(e -> !solicitacaoRepository.retiradasAbertasDoBalcao(e.getId(), dia).isEmpty())
                .orElse(almoxarifados.getFirst());
    }

    private ResumoCaminhao resumirCaminhao(UUID idEquipe) {
        Optional<Estoque> caminhao = estoqueRepository.findByIdEquipe(idEquipe);
        if (caminhao.isEmpty()) {
            return new ResumoCaminhao(0, 0, 0, 0);
        }
        List<Saldo> saldos = saldoRepository.findDiferentesDeZeroByEstoqueId(caminhao.get().getId());
        int positivos = (int) saldos.stream().filter(s -> s.getQuantidade().signum() > 0).count();
        int sucatas = (int) saldos.stream().filter(s -> s.getQuantidade().signum() > 0 && s.getCondicao() == CondicaoMaterial.SUCATA).count();
        int negativos = (int) saldos.stream().filter(s -> s.getQuantidade().signum() < 0).count();
        int obras = (int) alocacaoRepository.listarDoLocal(caminhao.get().getId()).stream()
                .filter(a -> a.getQuantidade().signum() > 0).map(AlocacaoObra::getIdObra).distinct().count();
        return new ResumoCaminhao(positivos, obras, sucatas, negativos);
    }

    /** O caminhão separado por obra: o carimbado de cada obra e, por último, o livre. */
    private List<BalcaoResponses.GrupoCaminhao> gruposDoCaminhao(Estoque caminhao, List<AlocacaoObra> alocacoes,
                                                                Map<UUID, ObraApi.ObraPublica> obras) {
        record Chave(UUID idMaterial, CondicaoMaterial condicao) {
        }
        Map<Chave, Saldo> saldos = saldoRepository.findDiferentesDeZeroByEstoqueId(caminhao.getId()).stream()
                .filter(s -> s.getQuantidade().signum() > 0)
                .collect(Collectors.toMap(s -> new Chave(s.getMaterial().getId(), s.getCondicao()), s -> s, (a, b) -> a, LinkedHashMap::new));
        Map<Chave, List<String>> series = serieRepository.findByEstoqueIdAndAtivoTrue(caminhao.getId()).stream()
                .collect(Collectors.groupingBy(s -> new Chave(s.getMaterial().getId(), s.getCondicao()),
                        Collectors.mapping(SaldoSerie::getNumSerie, Collectors.toList())));
        Map<UUID, List<BalcaoResponses.ItemCaminhao>> porObra = new LinkedHashMap<>();
        Map<Chave, BigDecimal> alocado = new HashMap<>();
        for (AlocacaoObra a : alocacoes) {
            if (a.getQuantidade().signum() <= 0) {
                continue;
            }
            Chave chave = new Chave(a.getMaterial().getId(), a.getCondicao());
            Saldo saldo = saldos.get(chave);
            BigDecimal fisico = saldo == null ? BigDecimal.ZERO : saldo.getQuantidade();
            BigDecimal jaUsado = alocado.getOrDefault(chave, BigDecimal.ZERO);
            BigDecimal quantidade = a.getQuantidade().min(fisico.subtract(jaUsado));
            if (quantidade.signum() <= 0) {
                continue;
            }
            alocado.merge(chave, quantidade, BigDecimal::add);
            porObra.computeIfAbsent(a.getIdObra(), k -> new ArrayList<>()).add(item(a.getMaterial(), a.getCondicao(), quantidade, List.of()));
        }
        List<BalcaoResponses.ItemCaminhao> livres = new ArrayList<>();
        saldos.forEach((chave, saldo) -> {
            BigDecimal livre = saldo.getQuantidade().subtract(alocado.getOrDefault(chave, BigDecimal.ZERO));
            if (livre.signum() > 0) {
                livres.add(item(saldo.getMaterial(), chave.condicao(), livre, series.getOrDefault(chave, List.of())));
            }
        });
        List<BalcaoResponses.GrupoCaminhao> grupos = new ArrayList<>();
        porObra.forEach((idObra, itens) -> {
            ObraApi.ObraPublica obra = obras.get(idObra);
            itens.sort(Comparator.comparing(BalcaoResponses.ItemCaminhao::condicao).thenComparing(BalcaoResponses.ItemCaminhao::codigo));
            grupos.add(new BalcaoResponses.GrupoCaminhao(idObra, obra == null ? null : obra.numero(),
                    obra == null ? null : obra.titulo(), itens));
        });
        grupos.sort(Comparator.comparing(g -> Objects.toString(g.numeroObra(), "")));
        if (!livres.isEmpty()) {
            livres.sort(Comparator.comparing(BalcaoResponses.ItemCaminhao::condicao).thenComparing(BalcaoResponses.ItemCaminhao::codigo));
            grupos.add(new BalcaoResponses.GrupoCaminhao(null, null, null, livres));
        }
        return grupos;
    }

    private static BalcaoResponses.ItemCaminhao item(Material m, CondicaoMaterial condicao, BigDecimal quantidade, List<String> series) {
        return new BalcaoResponses.ItemCaminhao(m.getId(), m.getCodigo(), m.getDescricao(), m.getUnidadeMedida(),
                condicao.name(), quantidade, m.isDetalhaSerie(), series);
    }

    private List<BalcaoResponses.Pessoa> pessoas(EquipeResponse equipe) {
        if (equipe.membros() == null) {
            return List.of();
        }
        List<EquipeMembroResponse> ativos = equipe.membros().stream().filter(EquipeMembroResponse::vinculoAtivo).toList();
        Map<UUID, String> matriculas = colaboradorApi.buscarMatriculasPorIds(
                ativos.stream().map(EquipeMembroResponse::idColaborador).toList());
        return ativos.stream()
                .sorted(Comparator.comparing((EquipeMembroResponse m) -> !ehResponsavel(m))
                        .thenComparing(m -> Objects.toString(m.nomeColaborador(), "")))
                .map(m -> new BalcaoResponses.Pessoa(m.idColaborador(), m.nomeColaborador(), matriculas.get(m.idColaborador()),
                        ehResponsavel(m)))
                .toList();
    }

    private static boolean ehResponsavel(EquipeMembroResponse m) {
        return "RESPONSAVEL".equals(String.valueOf(m.funcao()));
    }

    private static String encarregado(EquipeResponse equipe) {
        if (equipe.membros() == null) {
            return null;
        }
        return equipe.membros().stream()
                .filter(m -> m.vinculoAtivo() && ehResponsavel(m))
                .map(EquipeMembroResponse::nomeColaborador)
                .findFirst().orElse(null);
    }

    private static OffsetDateTime ultima(List<AtendimentoBalcao> atendimentos, UUID idEquipe, AtendimentoBalcao.Tipo tipo) {
        return atendimentos.stream()
                .filter(a -> a.getIdEquipe().equals(idEquipe) && a.getTipo() == tipo)
                .map(AtendimentoBalcao::getRealizadoEm)
                .max(Comparator.naturalOrder()).orElse(null);
    }

    private BalcaoResponses.AtendimentoResumo resumo(AtendimentoBalcao a, Map<UUID, EquipeResponse> equipes) {
        EquipeResponse equipe = equipes.get(a.getIdEquipe());
        String operador = a.getIdUsuarioOperador() == null ? null
                : colaboradorApi.buscarNomeCompletoPorUsuario(a.getIdUsuarioOperador()).orElse(null);
        List<BalcaoResponses.ItemAtendimento> itens = a.getItens().stream()
                .map(i -> new BalcaoResponses.ItemAtendimento(i.codigo(), i.descricao(), i.unidade(), i.quantidade(),
                        i.condicao(), i.numeroObra(), i.numeroSerie(), i.destino(), i.excedente(), i.motivoExcedente()))
                .toList();
        boolean fisica = ComprovanteBalcaoService.FISICA.equals(a.getAssinatura());
        return new BalcaoResponses.AtendimentoResumo(a.getId(), a.getTipo().name(), a.getIdEquipe(),
                equipe == null ? null : equipe.codigo(), a.getNomeColaborador(), a.getMatricula(), a.getRealizadoEm(),
                operador, a.getAssinatura() != null && !fisica, fisica, a.getFoto() != null, a.getObservacao(), itens);
    }

    private String numeroObra(UUID idObra) {
        if (idObra == null) {
            return null;
        }
        return obraApi.numerosPorIds(List.of(idObra)).getOrDefault(idObra, "sem número");
    }

    private void creditar(Estoque estoque, Material material, CondicaoMaterial condicao, BigDecimal quantidade) {
        Saldo saldo = saldoRepository.findWithLockByEstoqueIdAndMaterialIdAndCondicao(estoque.getId(), material.getId(), condicao)
                .orElseGet(() -> new Saldo(estoque, material, condicao));
        saldo.adicionarQuantidade(quantidade);
        saldoRepository.save(saldo);
    }

    private static String motivoExcedente(String motivo) {
        String limpo = vazioParaNulo(motivo);
        return limpo == null ? "Entregue acima do pedido no balcão." : limpo;
    }

    private static String vazioParaNulo(String valor) {
        return valor == null || valor.isBlank() ? null : valor.trim();
    }

    private static UUID operador() {
        UUID id = SecurityUtils.getUsuarioLogadoId();
        if (id == null) {
            throw new InvarianteVioladaException("Entre no sistema para atender no balcão.");
        }
        return id;
    }

    private static String texto(BigDecimal v) {
        return v.stripTrailingZeros().toPlainString().replace('.', ',');
    }
}
