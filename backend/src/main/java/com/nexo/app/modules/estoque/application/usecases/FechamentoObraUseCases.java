package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.services.ProcessoMaterialService;
import com.nexo.app.modules.estoque.domain.ContextoSolicitacaoMaterial;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraFilter;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraRequests;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraResponses;
import com.nexo.app.modules.estoque.application.dto.HistoricoSolicitacaoResponse;
import com.nexo.app.modules.estoque.application.services.ContextoRegistroEventoSolicitacao;
import com.nexo.app.modules.estoque.application.services.GravadorEventoSolicitacaoService;
import com.nexo.app.modules.estoque.application.services.IdempotenciaComandoSolicitacaoService;
import com.nexo.app.modules.estoque.application.services.ObservabilidadeSolicitacaoTecnica;
import com.nexo.app.modules.estoque.application.services.ResolvedorAutorEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.AlteracaoEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.ItemSolicitacao;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.MotivoPendencia;
import com.nexo.app.modules.estoque.domain.OrigemComandoTecnico;
import com.nexo.app.modules.estoque.domain.PayloadEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.ReservaSolicitacaoTecnica;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoObra;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoSolicitacao;
import com.nexo.app.modules.estoque.domain.SolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.TipoEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.TipoSolicitacaoTecnica;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.FechamentoObraSpecification;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.OperacaoSolicitacaoMaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.ReservaSolicitacaoTecnicaRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SolicitacaoMaterialRepository;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.modules.obras.ObraApi.ObraPublica;
import com.nexo.app.modules.rh.ColaboradorApi;
import com.nexo.app.modules.rh.SupervisorApi;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.HorasUteis;
import com.nexo.app.shared.domain.exception.ConflitoVersaoException;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.PreenchimentoInvalidoException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.modules.estoque.domain.SituacaoPrazoFechamento;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.stream.Collectors;

/** Solicitações de encerramento de obra: criação, edição, reserva, pendências, cancelamento e consultas. */
// Nome próprio: o módulo de obras já tem um FechamentoObraUseCases (fechamento das medições).
@Service("encerramentoObraUseCases")
@RequiredArgsConstructor
public class FechamentoObraUseCases {

    /** O calendário pede o mês inteiro numa página só. */
    private static final int TAMANHO_MAXIMO_PAGINA = 500;

    private static final String ESCOPO_CRIACAO = "FECHAMENTO_CRIAR";

    private final SolicitacaoMaterialRepository repository;
    private final OperacaoSolicitacaoMaterialRepository operacaoRepository;
    private final ReservaSolicitacaoTecnicaRepository reservaRepository;
    private final MaterialRepository materialRepository;
    private final ProcessoMaterialService processoMaterial;
    private final EstoqueRepository estoqueRepository;
    private final EstoqueObraProvisioningService estoqueObraProvisioningService;
    private final MotivoPendenciaUseCases motivos;
    private final ObraApi obraApi;
    private final ColaboradorApi colaboradorApi;
    private final SupervisorApi supervisorApi;
    private final GravadorEventoSolicitacaoService gravadorEvento;
    private final IdempotenciaComandoSolicitacaoService idempotencia;
    private final ResolvedorAutorEventoSolicitacao resolvedorAutor;
    private final HistoricoSolicitacaoUseCases historico;
    private final MontadorFechamentoObra montador;
    private final EntityManager entityManager;

    // --- Comandos -------------------------------------------------------------

    @Transactional
    public FechamentoObraResponses.Criacao criar(
            FechamentoObraRequests.Criar request,
            UUID idUsuario,
            String chaveIdempotencia
    ) {
        Objects.requireNonNull(idUsuario, "O usuario e obrigatorio");
        IdempotenciaComandoSolicitacaoService.Consulta<FechamentoObraResponses.Criacao> consulta = null;
        if (chaveIdempotencia != null) {
            consulta = idempotencia.consultar(ESCOPO_CRIACAO, idUsuario, chaveIdempotencia, request,
                    FechamentoObraResponses.Criacao.class, ObservabilidadeSolicitacaoTecnica.Operacao.CRIACAO);
            if (consulta.repetida()) {
                return consulta.resposta();
            }
        }
        if (request == null) {
            throw new PreenchimentoInvalidoException(Map.of("idObra", "Informe a obra."));
        }
        Map<String, String> erros = new LinkedHashMap<>();
        ObraPublica obra = request.idObra() == null ? null
                : obraApi.buscarPorId(request.idObra()).filter(ObraPublica::ativa).orElse(null);
        if (obra == null) {
            erros.put("idObra", "Informe uma obra ativa.");
        }
        Estoque almoxarifado = almoxarifado(request.idAlmoxarifadoAtendimento(), erros);
        validarResponsaveis(request.idEncarregado(), request.idSupervisor(), erros);
        validarObservacao(request.observacao(), erros);

        List<FechamentoObraRequests.Criar.Solicitacao> solicitacoes = request.solicitacoes() == null
                ? List.of() : request.solicitacoes();
        if (solicitacoes.isEmpty()) {
            erros.put("solicitacoes", "Monte ao menos uma solicitação.");
        }
        List<Preparada> preparadas = new ArrayList<>();
        for (int indice = 0; indice < solicitacoes.size(); indice++) {
            preparadas.add(preparar(solicitacoes.get(indice), "solicitacoes[" + indice + "]", erros));
        }
        if (!erros.isEmpty()) {
            throw new PreenchimentoInvalidoException(erros);
        }

        Estoque estoqueObra = estoqueObraProvisioningService.resolverOuProvisionar(obra);
        List<UUID> ids = new ArrayList<>();
        for (Preparada preparada : preparadas) {
            SolicitacaoMaterial solicitacao = SolicitacaoMaterial.criarFechamento(
                    obra, preparada.tipo(), estoqueObra, almoxarifado,
                    request.idEncarregado(), request.idSupervisor(), request.observacao(), idUsuario);
            preparada.itens().forEach((material, quantidade) -> solicitacao.adicionarItemFechamento(material, quantidade));
            SolicitacaoMaterial salva = repository.saveAndFlush(solicitacao);
            if (preparada.numeroReserva() != null) {
                ReservaSolicitacaoTecnica reserva = reservaRepository.save(new ReservaSolicitacaoTecnica(
                        salva, preparada.numeroReserva(), preparada.dataReserva(), null, null, null, idUsuario));
                salva.reservaRegistradaNoFechamento(reserva.getRegistradaEm());
                repository.save(salva);
            }
            registrarEvento(salva, TipoEventoSolicitacao.FECHAMENTO_CRIADO, "CRIAR_FECHAMENTO",
                    List.of(), Map.of(
                            "tipo", salva.getTipoTecnico().getCodigo(),
                            "itens", salva.getItens().stream()
                                    .map(item -> item.getMaterial().getCodigo() + " x " + item.getQuantidade().stripTrailingZeros().toPlainString())
                                    .toList(),
                            "reserva", salva.getReserva() == null ? "" : salva.getReserva().getNumeroApi()),
                    idUsuario, null);
            ids.add(salva.getId());
        }
        FechamentoObraResponses.Criacao resposta = new FechamentoObraResponses.Criacao(ids);
        if (consulta != null) {
            idempotencia.registrar(consulta, ids.getFirst(), null, resposta);
        }
        return resposta;
    }

    @Transactional
    public void editar(UUID id, FechamentoObraRequests.Editar request, UUID idUsuario) {
        Objects.requireNonNull(request, "Os dados da edicao sao obrigatorios");
        SolicitacaoMaterial solicitacao = carregarParaComando(id, request.versaoEsperada());
        Map<String, String> erros = new LinkedHashMap<>();
        validarResponsaveis(
                mudou(solicitacao.getIdEncarregado(), request.idEncarregado()) ? request.idEncarregado() : null,
                mudou(solicitacao.getIdSupervisor(), request.idSupervisor()) ? request.idSupervisor() : null,
                erros);
        validarObservacao(request.observacao(), erros);
        List<FechamentoObraRequests.Editar.Item> itens = request.itens() == null ? List.of() : request.itens();
        if (itens.isEmpty()) {
            erros.put("itens", "A solicitação precisa de ao menos um material. Para desistir, cancele.");
        }
        Map<UUID, Material> materiaisNovos = new LinkedHashMap<>();
        Set<UUID> materiaisVistos = new HashSet<>();
        for (int indice = 0; indice < itens.size(); indice++) {
            FechamentoObraRequests.Editar.Item item = itens.get(indice);
            String campo = "itens[" + indice + "]";
            if (item.quantidade() == null || item.quantidade().signum() <= 0) {
                erros.put(campo + ".quantidade", "Informe uma quantidade positiva.");
            }
            if (item.idItem() == null) {
                Material material = material(item.idMaterial(), campo + ".idMaterial", erros);
                if (material != null) {
                    materiaisNovos.put(material.getId(), material);
                }
            }
            UUID idMaterial = item.idItem() == null ? item.idMaterial() : solicitacao.getItens().stream()
                    .filter(existente -> existente.getId().equals(item.idItem()))
                    .map(existente -> existente.getMaterial().getId())
                    .findFirst().orElse(null);
            if (idMaterial != null && !materiaisVistos.add(idMaterial)) {
                erros.put(campo + ".idMaterial", "Material repetido na solicitação.");
            }
        }
        if (!erros.isEmpty()) {
            throw new PreenchimentoInvalidoException(erros);
        }

        List<AlteracaoEventoSolicitacao> alteracoes = new ArrayList<>();
        if (mudou(solicitacao.getIdEncarregado(), request.idEncarregado())
                || mudou(solicitacao.getIdSupervisor(), request.idSupervisor())) {
            alteracoes.add(new AlteracaoEventoSolicitacao("encarregado", solicitacao.getIdEncarregado(), request.idEncarregado()));
            alteracoes.add(new AlteracaoEventoSolicitacao("supervisor", solicitacao.getIdSupervisor(), request.idSupervisor()));
            solicitacao.definirResponsaveisFechamento(request.idEncarregado(), request.idSupervisor());
        }
        String observacao = request.observacao() == null || request.observacao().isBlank() ? null : request.observacao().trim();
        if (mudou(solicitacao.getObservacao(), observacao)) {
            alteracoes.add(new AlteracaoEventoSolicitacao("observacao", solicitacao.getObservacao(), observacao));
            solicitacao.definirObservacaoFechamento(observacao);
        }

        Set<UUID> mantidos = itens.stream().map(FechamentoObraRequests.Editar.Item::idItem)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        for (ItemSolicitacao existente : List.copyOf(solicitacao.getItens())) {
            if (!mantidos.contains(existente.getId())) {
                solicitacao.removerItemFechamento(existente.getId());
                alteracoes.add(new AlteracaoEventoSolicitacao(
                        "itens[" + existente.getMaterial().getCodigo() + "]", existente.getQuantidade(), null));
            }
        }
        for (FechamentoObraRequests.Editar.Item item : itens) {
            if (item.idItem() == null) {
                continue;
            }
            ItemSolicitacao existente = solicitacao.getItens().stream()
                    .filter(candidato -> candidato.getId().equals(item.idItem()))
                    .findFirst()
                    .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado nesta solicitação."));
            if (existente.getQuantidade().compareTo(item.quantidade()) != 0) {
                alteracoes.add(new AlteracaoEventoSolicitacao(
                        "itens[" + existente.getMaterial().getCodigo() + "].quantidade",
                        existente.getQuantidade(), item.quantidade()));
                solicitacao.alterarQuantidadeItemFechamento(existente.getId(), item.quantidade());
            }
        }
        for (FechamentoObraRequests.Editar.Item item : itens) {
            if (item.idItem() == null) {
                Material material = materiaisNovos.get(item.idMaterial());
                solicitacao.adicionarItemFechamento(material, item.quantidade());
                alteracoes.add(new AlteracaoEventoSolicitacao(
                        "itens[" + material.getCodigo() + "]", null, item.quantidade()));
            }
        }
        SolicitacaoMaterial salva = repository.saveAndFlush(solicitacao);
        if (!alteracoes.isEmpty()) {
            registrarEvento(salva, TipoEventoSolicitacao.FECHAMENTO_ALTERADO, "EDITAR_FECHAMENTO",
                    alteracoes, Map.of(), idUsuario, null);
        }
    }

    @Transactional
    public void registrarReserva(
            UUID id,
            FechamentoObraRequests.RegistrarReserva request,
            UUID idUsuario
    ) {
        Objects.requireNonNull(request, "Os dados da reserva sao obrigatorios");
        SolicitacaoMaterial solicitacao = carregarParaComando(id, request.versaoEsperada());
        if (solicitacao.getSituacaoFechamento() == SituacaoFechamentoSolicitacao.CANCELADA) {
            throw new InvarianteVioladaException("A solicitação está cancelada.");
        }
        Map<String, String> erros = new LinkedHashMap<>();
        BigInteger numero = numeroReserva(request.numero(), "numero", erros);
        LocalDate dataCriacao = request.dataCriacao() == null ? LocalDate.now(HorasUteis.FUSO) : request.dataCriacao();
        if (dataCriacao.isAfter(LocalDate.now(HorasUteis.FUSO))) {
            erros.put("dataCriacao", "A data da reserva não pode ser futura.");
        }
        if (!erros.isEmpty()) {
            throw new PreenchimentoInvalidoException(erros);
        }
        ReservaSolicitacaoTecnica reserva = reservaRepository.findBySolicitacaoId(id).orElse(null);
        OffsetDateTime agora = OffsetDateTime.now();
        if (reserva == null) {
            reserva = reservaRepository.save(new ReservaSolicitacaoTecnica(
                    solicitacao, numero, dataCriacao, null, null, null, idUsuario));
            solicitacao.reservaRegistradaNoFechamento(agora);
            repository.save(solicitacao);
            registrarEvento(solicitacao, TipoEventoSolicitacao.RESERVA_REGISTRADA, "REGISTRAR_RESERVA",
                    List.of(new AlteracaoEventoSolicitacao("reserva.numero", null, reserva.getNumeroApi()),
                            new AlteracaoEventoSolicitacao("reserva.dataCriacao", null, dataCriacao)),
                    Map.of(), idUsuario, null);
        } else if (!reserva.possuiMesmosDados(numero, dataCriacao, null)) {
            String numeroAnterior = reserva.getNumeroApi();
            LocalDate dataAnterior = reserva.getDataCriacao();
            reserva.atualizar(numero, dataCriacao, null, null, null, idUsuario);
            reservaRepository.save(reserva);
            solicitacao.reservaRegistradaNoFechamento(agora);
            repository.save(solicitacao);
            registrarEvento(solicitacao, TipoEventoSolicitacao.RESERVA_ALTERADA, "ALTERAR_RESERVA",
                    List.of(new AlteracaoEventoSolicitacao("reserva.numero", numeroAnterior, reserva.getNumeroApi()),
                            new AlteracaoEventoSolicitacao("reserva.dataCriacao", dataAnterior, dataCriacao)),
                    Map.of(), idUsuario, null);
        }
    }

    @Transactional
    public void registrarPendencia(
            UUID id,
            FechamentoObraRequests.Pendencia request,
            UUID idUsuario
    ) {
        Objects.requireNonNull(request, "Os dados da pendencia sao obrigatorios");
        SolicitacaoMaterial solicitacao = carregarParaComando(id, null);
        if (request.idMotivoPendencia() == null) {
            throw new PreenchimentoInvalidoException(Map.of("idMotivoPendencia", "Escolha o motivo."));
        }
        MotivoPendencia motivo = motivos.buscar(request.idMotivoPendencia());
        String alvo;
        if (request.idItem() == null) {
            solicitacao.registrarPendenciaGeralFechamento(motivo, request.justificativa());
            alvo = "pendencia";
        } else {
            solicitacao.registrarPendenciaItemFechamento(request.idItem(), motivo, request.justificativa());
            alvo = "itens[" + codigoItem(solicitacao, request.idItem()) + "].pendencia";
        }
        repository.save(solicitacao);
        registrarEvento(solicitacao, TipoEventoSolicitacao.PENDENCIA_REGISTRADA, "REGISTRAR_PENDENCIA",
                List.of(new AlteracaoEventoSolicitacao(alvo, null, motivo.getNome())), Map.of(),
                idUsuario, request.justificativa());
    }

    @Transactional
    public void removerPendencia(UUID id, UUID idItem, UUID idUsuario) {
        SolicitacaoMaterial solicitacao = carregarParaComando(id, null);
        String alvo;
        String anterior;
        if (idItem == null) {
            anterior = solicitacao.getMotivoPendenciaGeral() == null ? null : solicitacao.getMotivoPendenciaGeral().getNome();
            solicitacao.removerPendenciaGeralFechamento();
            alvo = "pendencia";
        } else {
            ItemSolicitacao item = solicitacao.getItens().stream()
                    .filter(candidato -> candidato.getId().equals(idItem)).findFirst()
                    .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado nesta solicitação."));
            anterior = item.getMotivoPendencia() == null ? null : item.getMotivoPendencia().getNome();
            solicitacao.removerPendenciaItemFechamento(idItem);
            alvo = "itens[" + item.getMaterial().getCodigo() + "].pendencia";
        }
        repository.save(solicitacao);
        if (anterior != null) {
            registrarEvento(solicitacao, TipoEventoSolicitacao.PENDENCIA_REMOVIDA, "REMOVER_PENDENCIA",
                    List.of(new AlteracaoEventoSolicitacao(alvo, anterior, null)), Map.of(), idUsuario, null);
        }
    }

    @Transactional
    public void cancelar(UUID id, FechamentoObraRequests.Cancelar request, UUID idUsuario) {
        Objects.requireNonNull(request, "Os dados do cancelamento sao obrigatorios");
        if (request.motivo() == null || request.motivo().isBlank()) {
            throw new PreenchimentoInvalidoException(Map.of("motivo", "Informe o motivo do cancelamento."));
        }
        SolicitacaoMaterial solicitacao = carregarParaComando(id, request.versaoEsperada());
        SituacaoFechamentoSolicitacao anterior = solicitacao.getSituacaoFechamento();
        solicitacao.cancelarFechamento(idUsuario, request.motivo());
        repository.save(solicitacao);
        registrarEvento(solicitacao, TipoEventoSolicitacao.CANCELAMENTO_CONFIRMADO, "CANCELAR_FECHAMENTO",
                List.of(new AlteracaoEventoSolicitacao("situacao", anterior, solicitacao.getSituacaoFechamento())),
                Map.of(), idUsuario, request.motivo());
    }

    // --- Consultas ------------------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<FechamentoObraResponses.Resumo> listar(FechamentoObraFilter filtro, Pageable pageable) {
        FechamentoObraFilter efetivo = filtro == null ? FechamentoObraFilter.vazio() : filtro;
        if (efetivo.situacaoObra() == SituacaoFechamentoObra.SEM_SOLICITACOES) {
            return PageResponse.fromPage(Page.empty(pageable));
        }
        Pageable ordenado = PageRequest.of(pageable.getPageNumber(), Math.min(Math.max(pageable.getPageSize(), 1), TAMANHO_MAXIMO_PAGINA),
                pageable.getSort().isSorted() ? pageable.getSort()
                        : Sort.by(Sort.Order.asc("prazoVigenteAte"), Sort.Order.desc("dataSolicitacao")));
        var especificacao = especificacao(efetivo);
        Sort.Order ordem = ordenado.getSort().stream().findFirst().orElse(null);
        if (ordem != null && MontadorFechamentoObra.ordenaForaDoBanco(ordem.getProperty())) {
            return ordenadoForaDoBanco(repository.findAll(especificacao), ordem, ordenado);
        }
        Page<SolicitacaoMaterial> pagina = repository.findAll(especificacao, ordenado);
        MontadorFechamentoObra.Contexto contexto = montador.contexto(pagina.getContent());
        return PageResponse.fromPage(pagina.map(solicitacao -> montador.resumo(solicitacao, contexto)));
    }

    /** Recorte da lista, da mais recente para a mais antiga, para a exportação. Roda na transação de quem chama. */
    public void percorrerRecorte(FechamentoObraFilter filtro, BiConsumer<SolicitacaoMaterial, FechamentoObraResponses.Resumo> linha) {
        FechamentoObraFilter efetivo = filtro == null ? FechamentoObraFilter.vazio() : filtro;
        if (efetivo.situacaoObra() == SituacaoFechamentoObra.SEM_SOLICITACOES) {
            return;
        }
        var especificacao = especificacao(efetivo);
        Pageable pagina = PageRequest.of(0, TAMANHO_MAXIMO_PAGINA,
                Sort.by(Sort.Order.desc("dataSolicitacao"), Sort.Order.desc("id")));
        Page<SolicitacaoMaterial> resultado;
        do {
            resultado = repository.findAll(especificacao, pagina);
            MontadorFechamentoObra.Contexto contexto = montador.contexto(resultado.getContent());
            resultado.forEach(solicitacao -> linha.accept(solicitacao, montador.resumo(solicitacao, contexto)));
            pagina = pagina.next();
        } while (resultado.hasNext());
    }

    private Specification<SolicitacaoMaterial> especificacao(FechamentoObraFilter filtro) {
        OffsetDateTime agora = OffsetDateTime.now();
        List<UUID> supervisoresDoCoordenador = filtro.idCoordenador() == null
                ? null : supervisorApi.buscarIdsPorCoordenador(filtro.idCoordenador());
        Set<UUID> obrasNaSituacao = filtro.situacaoObra() == null ? null
                : MontadorFechamentoObra.agruparSituacoes(repository.contarSituacoesFechamentoDeTodasAsObras())
                        .entrySet().stream()
                        .filter(entrada -> entrada.getValue() == filtro.situacaoObra())
                        .map(Map.Entry::getKey)
                        .collect(Collectors.toSet());
        Set<UUID> obrasDaBusca = filtro.busca() == null || filtro.busca().isBlank()
                ? null : obraApi.buscarIdsPorNumeroOuTitulo(filtro.busca().trim());
        return FechamentoObraSpecification.filtrar(
                filtro, supervisoresDoCoordenador, obrasNaSituacao, agora,
                HorasUteis.somar(agora, SituacaoPrazoFechamento.HORAS_UTEIS_ALERTA), obrasDaBusca);
    }

    /** Nomes vêm de outros módulos e ficam cifrados: ordena o recorte inteiro aqui e só então pagina. */
    private PageResponse<FechamentoObraResponses.Resumo> ordenadoForaDoBanco(
            List<SolicitacaoMaterial> solicitacoes,
            Sort.Order ordem,
            Pageable pageable
    ) {
        MontadorFechamentoObra.Contexto contexto = montador.contexto(solicitacoes);
        List<SolicitacaoMaterial> ordenadas = solicitacoes.stream()
                .sorted(montador.comparador(ordem.getProperty(), ordem.isAscending(), contexto))
                .toList();
        int inicio = (int) Math.min(pageable.getOffset(), ordenadas.size());
        int fim = Math.min(inicio + pageable.getPageSize(), ordenadas.size());
        List<FechamentoObraResponses.Resumo> pagina = ordenadas.subList(inicio, fim).stream()
                .map(solicitacao -> montador.resumo(solicitacao, contexto))
                .toList();
        return PageResponse.fromPage(new PageImpl<>(pagina, pageable, ordenadas.size()));
    }

    @Transactional(readOnly = true)
    public FechamentoObraResponses.Detalhe detalhe(UUID id) {
        SolicitacaoMaterial solicitacao = repository.findById(id)
                .filter(SolicitacaoMaterial::isFechamento)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Solicitação de encerramento não encontrada."));
        return montador.detalhe(solicitacao, operacaoRepository.findAllBySolicitacaoIdOrderByRealizadaEmAscIdAsc(id));
    }

    @Transactional(readOnly = true)
    public FechamentoObraResponses.SituacaoObra situacaoObra(UUID idObra) {
        Map<SituacaoFechamentoSolicitacao, Long> contagem = new java.util.EnumMap<>(SituacaoFechamentoSolicitacao.class);
        for (Object[] linha : repository.contarSituacoesFechamentoPorObra(List.of(idObra))) {
            if (linha[1] != null) {
                contagem.merge((SituacaoFechamentoSolicitacao) linha[1], ((Number) linha[2]).longValue(), Long::sum);
            }
        }
        long total = contagem.values().stream().mapToLong(Long::longValue).sum();
        long canceladas = contagem.getOrDefault(SituacaoFechamentoSolicitacao.CANCELADA, 0L);
        long movimentadas = contagem.getOrDefault(SituacaoFechamentoSolicitacao.MOVIMENTADA, 0L);
        return new FechamentoObraResponses.SituacaoObra(
                idObra,
                SituacaoFechamentoObra.de(contagem.keySet(), false),
                total,
                movimentadas,
                total - canceladas - movimentadas,
                canceladas);
    }

    @Transactional(readOnly = true)
    public Map<UUID, SituacaoFechamentoObra> situacoesObras(Collection<UUID> idsObras) {
        return montador.situacoesDasObras(idsObras);
    }

    @Transactional(readOnly = true)
    public List<FechamentoObraResponses.Pessoa> solicitantes() {
        return repository.listarSolicitantesFechamento().stream()
                .map(id -> new FechamentoObraResponses.Pessoa(id, resolvedorAutor.nomeDoColaborador(id).orElse(null)))
                .sorted(java.util.Comparator.comparing(FechamentoObraResponses.Pessoa::nome,
                        java.util.Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)))
                .toList();
    }

    @Transactional(readOnly = true)
    public HistoricoSolicitacaoResponse historico(UUID id, Pageable pageable) {
        repository.findById(id)
                .filter(SolicitacaoMaterial::isFechamento)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Solicitação de encerramento não encontrada."));
        HistoricoSolicitacaoResponse resposta = historico.porSolicitacao(id, null, pageable);
        return new HistoricoSolicitacaoResponse(
                resposta.eventos().stream().map(this::comNomeDoColaborador).toList(),
                resposta.page(),
                resposta.integridade());
    }

    /** O evento congela o nome do autor, que pode ser o login: na tela vale o colaborador. */
    private HistoricoSolicitacaoResponse.Evento comNomeDoColaborador(HistoricoSolicitacaoResponse.Evento evento) {
        HistoricoSolicitacaoResponse.Autor autor = evento.autor();
        if (autor == null || autor.id() == null) {
            return evento;
        }
        return new HistoricoSolicitacaoResponse.Evento(
                evento.id(), evento.escopo(), evento.idSolicitacao(), evento.sequencia(), evento.tipo(),
                evento.tipoTecnico(), evento.tipoObra(), evento.ocorrencia(),
                new HistoricoSolicitacaoResponse.Autor(autor.id(), resolvedorAutor.nomeDoColaborador(autor.id()).orElse(null)),
                evento.origem(), evento.justificativa(), evento.versao(), evento.ocorridoEm(), evento.payload());
    }

    // --- Apoio ----------------------------------------------------------------

    SolicitacaoMaterial carregarParaComando(UUID id, Long versaoEsperada) {
        SolicitacaoMaterial solicitacao = repository.findById(id)
                .filter(SolicitacaoMaterial::isFechamento)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Solicitação de encerramento não encontrada."));
        if (versaoEsperada != null && !Objects.equals(versaoEsperada, solicitacao.getVersao())) {
            throw new ConflitoVersaoException(
                    ConflitoVersaoException.Recurso.SOLICITACAO, versaoEsperada, solicitacao.getVersao());
        }
        // Trava a linha e incrementa a versão já: dois comandos não passam pela mesma versão.
        entityManager.lock(solicitacao, LockModeType.PESSIMISTIC_FORCE_INCREMENT);
        return solicitacao;
    }

    void registrarEvento(
            SolicitacaoMaterial solicitacao,
            TipoEventoSolicitacao tipo,
            String comando,
            List<AlteracaoEventoSolicitacao> alteracoes,
            Map<String, Object> snapshots,
            UUID idUsuario,
            String justificativa
    ) {
        gravadorEvento.registrarFilho(
                solicitacao, tipo, new PayloadEventoSolicitacao(comando, alteracoes, snapshots),
                new ContextoRegistroEventoSolicitacao(
                        idUsuario, "USUARIO " + idUsuario, OrigemComandoTecnico.UI,
                        justificativa == null || justificativa.isBlank() ? null : justificativa.trim()));
    }

    private Preparada preparar(
            FechamentoObraRequests.Criar.Solicitacao solicitacao,
            String campo,
            Map<String, String> erros
    ) {
        TipoSolicitacaoTecnica tipo = null;
        if (solicitacao == null || solicitacao.tipo() == null || solicitacao.tipo().isBlank()) {
            erros.put(campo + ".tipo", "Escolha o tipo: 221, 921, 222 ou 922.");
        } else {
            tipo = java.util.Arrays.stream(TipoSolicitacaoTecnica.values())
                    .filter(candidato -> candidato.getCodigo().equals(solicitacao.tipo().trim())
                            || candidato.name().equalsIgnoreCase(solicitacao.tipo().trim()))
                    .findFirst().orElse(null);
            if (tipo == null) {
                erros.put(campo + ".tipo", "Escolha o tipo: 221, 921, 222 ou 922.");
            }
        }
        BigInteger numero = null;
        LocalDate dataReserva = null;
        if (solicitacao != null && solicitacao.numeroReserva() != null && !solicitacao.numeroReserva().isBlank()) {
            numero = numeroReserva(solicitacao.numeroReserva(), campo + ".numeroReserva", erros);
            dataReserva = solicitacao.dataReserva() == null ? LocalDate.now(HorasUteis.FUSO) : solicitacao.dataReserva();
            if (dataReserva.isAfter(LocalDate.now(HorasUteis.FUSO))) {
                erros.put(campo + ".dataReserva", "A data da reserva não pode ser futura.");
            }
        }
        Map<Material, BigDecimal> itens = new LinkedHashMap<>();
        List<FechamentoObraRequests.Criar.Item> requisicoes = solicitacao == null || solicitacao.itens() == null
                ? List.of() : solicitacao.itens();
        if (requisicoes.isEmpty()) {
            erros.put(campo + ".itens", "Inclua ao menos um material.");
        }
        Set<UUID> vistos = new HashSet<>();
        for (int indice = 0; indice < requisicoes.size(); indice++) {
            FechamentoObraRequests.Criar.Item item = requisicoes.get(indice);
            String campoItem = campo + ".itens[" + indice + "]";
            Material material = material(item.idMaterial(), campoItem + ".idMaterial", erros);
            if (item.quantidade() == null || item.quantidade().signum() <= 0) {
                erros.put(campoItem + ".quantidade", "Informe uma quantidade positiva.");
            }
            if (material != null && !vistos.add(material.getId())) {
                erros.put(campoItem + ".idMaterial", "O material " + material.getCodigo() + " está repetido.");
            } else if (material != null && item.quantidade() != null) {
                itens.put(material, item.quantidade());
            }
        }
        return new Preparada(tipo, numero, dataReserva, itens);
    }

    private Material material(UUID idMaterial, String campo, Map<String, String> erros) {
        Material material = idMaterial == null ? null
                : materialRepository.findById(idMaterial).filter(Material::isAtivo).orElse(null);
        if (material == null) {
            erros.put(campo, "Escolha um material ativo.");
        } else {
            processoMaterial.incompatibilidade(ContextoSolicitacaoMaterial.FECHAMENTO, material)
                    .ifPresent(mensagem -> erros.put(campo, mensagem));
        }
        return material;
    }

    private Estoque almoxarifado(UUID id, Map<String, String> erros) {
        Estoque estoque = id == null ? null : estoqueRepository.findById(id).orElse(null);
        boolean fisico = estoque != null && estoque.isAtivo() && estoque.getTipoEstoque() != null
                && "FISICO".equalsIgnoreCase(estoque.getTipoEstoque().getNome());
        if (!fisico) {
            erros.put("idAlmoxarifadoAtendimento", "Escolha um almoxarifado ativo.");
            return null;
        }
        return estoque;
    }

    private void validarResponsaveis(UUID idEncarregado, UUID idSupervisor, Map<String, String> erros) {
        if (idEncarregado != null && !colaboradorApi.existeColaborador(idEncarregado)) {
            erros.put("idEncarregado", "O encarregado precisa ser um colaborador ativo.");
        }
        if (idSupervisor != null && !supervisorApi.existeSupervisor(idSupervisor)) {
            erros.put("idSupervisor", "O supervisor precisa estar ativo no cadastro de supervisores.");
        }
    }

    private static void validarObservacao(String observacao, Map<String, String> erros) {
        if (observacao != null && observacao.trim().length() > 1000) {
            erros.put("observacao", "A observação deve ter até 1000 caracteres.");
        }
    }

    private static BigInteger numeroReserva(String valor, String campo, Map<String, String> erros) {
        String limpo = valor == null ? "" : valor.trim();
        if (!limpo.matches("[0-9]{1,20}")) {
            erros.put(campo, "O número da reserva deve ter só números, até 20 dígitos.");
            return null;
        }
        return new BigInteger(limpo);
    }

    private static String codigoItem(SolicitacaoMaterial solicitacao, UUID idItem) {
        return solicitacao.getItens().stream().filter(item -> item.getId().equals(idItem))
                .map(item -> item.getMaterial().getCodigo()).findFirst().orElse(String.valueOf(idItem));
    }

    private static boolean mudou(Object anterior, Object novo) {
        return !Objects.equals(anterior, novo);
    }

    private record Preparada(
            TipoSolicitacaoTecnica tipo,
            BigInteger numeroReserva,
            LocalDate dataReserva,
            Map<Material, BigDecimal> itens
    ) {
    }
}
