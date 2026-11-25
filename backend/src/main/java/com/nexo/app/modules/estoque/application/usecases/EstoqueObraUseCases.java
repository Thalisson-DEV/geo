package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.application.dto.EstoqueObraRequests;
import com.nexo.app.modules.estoque.application.dto.EstoqueObraResponses;
import com.nexo.app.modules.estoque.application.services.AlocacaoObraService;
import com.nexo.app.modules.estoque.application.services.DebitoSaldoService;
import com.nexo.app.modules.estoque.domain.AlocacaoObra;
import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque.TipoMovimentacao;
import com.nexo.app.modules.estoque.domain.Saldo;
import com.nexo.app.modules.estoque.infrastructure.persistence.AlocacaoObraRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MovimentacaoEstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoRepository;
import com.nexo.app.modules.obras.ObraApi;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.nexo.app.shared.infrastructure.config.CacheNames.SALDOS;

/**
 * Estoque por obra: o material de cada obra em qualquer lugar (caminhão, canteiro), a devolução da sobra, o canteiro
 * e o remanejamento entre obras. Ver a change estoque-por-obra.
 */
@Service
@RequiredArgsConstructor
public class EstoqueObraUseCases {

    private static final int RASTROS = 100;

    private final EstoqueRepository estoqueRepository;
    private final MaterialRepository materialRepository;
    private final SaldoRepository saldoRepository;
    private final AlocacaoObraRepository alocacaoRepository;
    private final MovimentacaoEstoqueRepository movimentacaoRepository;
    private final AlocacaoObraService alocacao;
    private final DebitoSaldoService debitoSaldoService;
    private final ObraApi obraApi;

    // ── Consultas ─────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public EstoqueObraResponses.MaterialDaObra materialDaObra(UUID idObra) {
        obraApi.buscarPorId(idObra).orElseThrow(() -> new RecursoNaoEncontradoException("Obra não encontrada."));
        Map<UUID, ObraApi.MaterialPrevistoPublico> previstos = obraApi.materiaisPrevistos(idObra).stream()
                .collect(Collectors.toMap(ObraApi.MaterialPrevistoPublico::idMaterial, Function.identity(), (a, b) -> a));
        Map<UUID, MovimentacaoEstoqueRepository.TotaisMaterialObra> totais = movimentacaoRepository.totaisDaObra(idObra).stream()
                .collect(Collectors.toMap(MovimentacaoEstoqueRepository.TotaisMaterialObra::getIdMaterial, Function.identity()));
        Map<UUID, List<AlocacaoObra>> alocacoes = alocacaoRepository.listarDaObra(idObra).stream()
                .collect(Collectors.groupingBy(a -> a.getMaterial().getId()));

        Set<UUID> ids = new HashSet<>(previstos.keySet());
        ids.addAll(totais.keySet());
        ids.addAll(alocacoes.keySet());
        Map<UUID, Material> materiais = materialRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Material::getId, Function.identity()));

        List<EstoqueObraResponses.LinhaMaterial> linhas = ids.stream()
                .filter(materiais::containsKey)
                .map(id -> linha(materiais.get(id), previstos.get(id), totais.get(id), alocacoes.getOrDefault(id, List.of())))
                .filter(EstoqueObraUseCases::temAlgo)
                .sorted(Comparator.comparing(EstoqueObraResponses.LinhaMaterial::codigo))
                .toList();
        return new EstoqueObraResponses.MaterialDaObra(idObra, linhas, rastros(idObra));
    }

    @Transactional(readOnly = true)
    public EstoqueObraResponses.SaldoPorObra saldoPorObra(UUID idEstoque) {
        Estoque estoque = estoqueRepository.findById(idEstoque)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Estoque não encontrado."));
        return montarSaldoPorObra(estoque);
    }

    @Transactional(readOnly = true)
    public EstoqueObraResponses.SaldoPorObra caminhaoDaEquipe(UUID idEquipe) {
        Estoque estoque = estoqueRepository.findByIdEquipe(idEquipe)
                .orElseThrow(() -> new RecursoNaoEncontradoException("A equipe não tem caminhão (estoque de campo) cadastrado."));
        return montarSaldoPorObra(estoque);
    }

    // ── Comandos ──────────────────────────────────────────────────────────────

    /** A sobra do caminhão ou do canteiro volta livre ao almoxarifado, com a obra registrada no movimento. */
    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public UUID devolverSobra(EstoqueObraRequests.DevolverSobra request) {
        Estoque origem = local(request.idOrigem());
        if (!origem.guardaMaterialPorObra()) {
            throw new InvarianteVioladaException("A sobra sai do caminhão de uma equipe ou de um canteiro.");
        }
        Estoque almox = local(request.idAlmoxarifado());
        if (!"FISICO".equalsIgnoreCase(almox.getTipoEstoque().getNome())) {
            throw new InvarianteVioladaException("A sobra volta para um almoxarifado.");
        }
        UUID referencia = UUID.randomUUID();
        UUID operador = operador();
        for (EstoqueObraRequests.ItemObra item : request.itens()) {
            Material material = materialSemSerie(item.idMaterial());
            CondicaoMaterial condicao = condicao(item.condicao());
            exigirFisico(origem, material, condicao, item.quantidade());
            alocacao.liberar(origem, material, condicao, item.idObra(), item.quantidade());
            debitoSaldoService.debitar(origem, material, condicao, item.quantidade());
            creditar(almox, material, condicao, item.quantidade());
            movimentacaoRepository.save(MovimentacaoEstoque.criarPorObra(
                    origem, almox, material, item.quantidade(), TipoMovimentacao.DEVOLUCAO, condicao,
                    item.idObra(), item.idObra(), origem.getIdEquipe(), operador, referencia, request.observacao()));
        }
        return referencia;
    }

    /** A equipe deixa material no canteiro ou pega dele; cada material continua da mesma obra. */
    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public UUID movimentarCanteiro(UUID idCanteiro, EstoqueObraRequests.MovimentarCanteiro request) {
        Estoque canteiro = local(idCanteiro);
        if (!canteiro.isTipoCanteiro() || !canteiro.isAtivo()) {
            throw new InvarianteVioladaException("Escolha um canteiro ativo.");
        }
        Estoque caminhao = estoqueRepository.findByIdEquipe(request.idEquipe())
                .orElseThrow(() -> new InvarianteVioladaException("A equipe não tem caminhão (estoque de campo) cadastrado."));
        if (request.idLocal() != null
                && movimentacaoRepository.existsByTipoAndIdReferenciaOperacao(TipoMovimentacao.TRANSFERENCIA, request.idLocal())) {
            return request.idLocal();
        }
        boolean deixar = request.sentido() == EstoqueObraRequests.SentidoCanteiro.DEIXAR;
        Estoque origem = deixar ? caminhao : canteiro;
        Estoque destino = deixar ? canteiro : caminhao;
        UUID referencia = request.idLocal() != null ? request.idLocal() : UUID.randomUUID();
        UUID operador = operador();
        for (EstoqueObraRequests.ItemObra item : request.itens()) {
            Material material = materialSemSerie(item.idMaterial());
            CondicaoMaterial condicao = condicao(item.condicao());
            alocacao.acompanharTransferencia(origem, destino, material, condicao, item.idObra(), item.quantidade());
            debitoSaldoService.debitar(origem, material, condicao, item.quantidade());
            creditar(destino, material, condicao, item.quantidade());
            movimentacaoRepository.save(MovimentacaoEstoque.criarPorObra(
                    origem, destino, material, item.quantidade(), TipoMovimentacao.TRANSFERENCIA, condicao,
                    item.idObra(), item.idObra(), request.idEquipe(), operador, referencia,
                    deixar ? "Deixado no canteiro." : "Pego no canteiro."));
        }
        return referencia;
    }

    /** O administrativo muda a obra do material no mesmo local (ou libera), com motivo. */
    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public UUID remanejar(EstoqueObraRequests.Remanejar request) {
        if (Objects.equals(request.idObraOrigem(), request.idObraDestino())) {
            throw new InvarianteVioladaException("Escolha uma obra de destino diferente da de origem.");
        }
        Estoque local = local(request.idEstoque());
        if (!local.guardaMaterialPorObra()) {
            throw new InvarianteVioladaException("Só o material de caminhões e canteiros é separado por obra.");
        }
        if (request.idObraDestino() != null) {
            obraApi.buscarPorId(request.idObraDestino())
                    .orElseThrow(() -> new RecursoNaoEncontradoException("Obra de destino não encontrada."));
        }
        Material material = materialRepository.findById(request.idMaterial())
                .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado."));
        CondicaoMaterial condicao = condicao(request.condicao());
        BigDecimal disponivel = request.idObraOrigem() == null
                ? livre(local, material, condicao)
                : alocacaoRepository.buscarComLock(local.getId(), material.getId(), condicao, request.idObraOrigem())
                        .map(AlocacaoObra::getQuantidade).orElse(BigDecimal.ZERO);
        if (disponivel.compareTo(request.quantidade()) < 0) {
            throw new InvarianteVioladaException("Há só " + texto(disponivel) + " " + Objects.toString(material.getUnidadeMedida(), "")
                    + " de " + material.getDescricao() + (request.idObraOrigem() == null ? " livre" : " dessa obra")
                    + " em " + local.getNomeIdentificador() + ".");
        }
        alocacao.liberar(local, material, condicao, request.idObraOrigem(), request.quantidade());
        alocacao.alocar(local, material, condicao, request.idObraDestino(), request.quantidade());
        UUID referencia = UUID.randomUUID();
        movimentacaoRepository.save(MovimentacaoEstoque.criarPorObra(
                local, local, material, request.quantidade(), TipoMovimentacao.REMANEJAMENTO, condicao,
                request.idObraDestino(), request.idObraOrigem(), local.getIdEquipe(), operador(), referencia, request.motivo()));
        return referencia;
    }

    // ── Apoio ─────────────────────────────────────────────────────────────────

    private EstoqueObraResponses.LinhaMaterial linha(Material material, ObraApi.MaterialPrevistoPublico previsto,
                                                     MovimentacaoEstoqueRepository.TotaisMaterialObra t,
                                                     List<AlocacaoObra> alocacoes) {
        List<EstoqueObraResponses.Local> onde = alocacoes.stream()
                .sorted(Comparator.comparing(a -> a.getEstoque().getNomeIdentificador()))
                .map(a -> new EstoqueObraResponses.Local(a.getEstoque().getId(), a.getEstoque().getNomeIdentificador(),
                        a.getEstoque().getTipoEstoque().getNome(), a.getEstoque().getIdEquipe(), a.getCondicao(), a.getQuantidade()))
                .toList();
        BigDecimal comEquipes = alocacoes.stream()
                .filter(a -> a.getCondicao() == CondicaoMaterial.NOVO)
                .map(AlocacaoObra::getQuantidade).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new EstoqueObraResponses.LinhaMaterial(
                material.getId(), material.getCodigo(), material.getDescricao(), material.getUnidadeMedida(),
                previsto == null ? BigDecimal.ZERO : previsto.previsto(),
                valor(t == null ? null : t.getEntregue()),
                valor(t == null ? null : t.getAplicado()),
                comEquipes,
                valor(t == null ? null : t.getDevolvido()),
                valor(t == null ? null : t.getRetirado()),
                valor(t == null ? null : t.getRecebido()),
                valor(t == null ? null : t.getCedido()),
                valor(t == null ? null : t.getSemMaterialDaObra()),
                valor(t == null ? null : t.getAplicadoSemSaldo()),
                onde);
    }

    private static boolean temAlgo(EstoqueObraResponses.LinhaMaterial l) {
        return Stream.of(l.previsto(), l.entregue(), l.aplicado(), l.comEquipes(), l.devolvido(), l.retirado(),
                        l.recebido(), l.cedido())
                .anyMatch(v -> v.signum() != 0) || !l.onde().isEmpty();
    }

    private List<EstoqueObraResponses.Rastro> rastros(UUID idObra) {
        List<MovimentacaoEstoque> movimentos = movimentacaoRepository.rastrosEntreObras(idObra, PageRequest.of(0, RASTROS));
        Set<UUID> outras = new HashSet<>();
        movimentos.forEach(m -> {
            outras.add(m.getIdObra());
            outras.add(m.getIdObraOrigem());
        });
        outras.remove(null);
        outras.remove(idObra);
        Map<UUID, String> numeros = obraApi.numerosPorIds(outras);
        return movimentos.stream().map(m -> {
            boolean recebido = idObra.equals(m.getIdObra());
            UUID outra = recebido ? m.getIdObraOrigem() : m.getIdObra();
            Material material = m.getMaterial();
            String sentido = m.getIdObraOrigem() == null && m.getTipo() == TipoMovimentacao.APLICACAO
                    ? (AplicacaoMaterialObraUseCases.OBS_SEM_SALDO.equals(m.getObservacao()) ? "SEM_SALDO" : "LIVRE")
                    : recebido ? "RECEBIDO" : "CEDIDO";
            return new EstoqueObraResponses.Rastro(m.getId(), m.getDataHora(), m.getTipo().name(),
                    sentido, material.getCodigo(), material.getDescricao(), material.getUnidadeMedida(),
                    m.getQuantidade(), outra, outra == null ? null : numeros.get(outra),
                    m.getEstoqueOrigem() == null ? null : m.getEstoqueOrigem().getNomeIdentificador(), m.getObservacao());
        }).toList();
    }

    private EstoqueObraResponses.SaldoPorObra montarSaldoPorObra(Estoque estoque) {
        record Chave(UUID idMaterial, CondicaoMaterial condicao) {
        }
        Map<Chave, Saldo> saldos = saldoRepository.findDiferentesDeZeroByEstoqueId(estoque.getId()).stream()
                .collect(Collectors.toMap(s -> new Chave(s.getMaterial().getId(), s.getCondicao()), Function.identity(),
                        (a, b) -> a, LinkedHashMap::new));
        Map<Chave, List<AlocacaoObra>> alocacoes = alocacaoRepository.listarDoLocal(estoque.getId()).stream()
                .collect(Collectors.groupingBy(a -> new Chave(a.getMaterial().getId(), a.getCondicao())));
        Set<Chave> chaves = new HashSet<>(saldos.keySet());
        chaves.addAll(alocacoes.keySet());
        Set<UUID> obras = alocacoes.values().stream().flatMap(List::stream).map(AlocacaoObra::getIdObra).collect(Collectors.toSet());
        Map<UUID, String> numeros = obraApi.numerosPorIds(obras);

        List<EstoqueObraResponses.MaterialNoLocal> materiais = new ArrayList<>();
        for (Chave chave : chaves) {
            Saldo saldo = saldos.get(chave);
            List<AlocacaoObra> doMaterial = alocacoes.getOrDefault(chave, List.of());
            Material material = saldo != null ? saldo.getMaterial() : doMaterial.getFirst().getMaterial();
            BigDecimal fisico = saldo == null ? BigDecimal.ZERO : saldo.getQuantidade();
            BigDecimal alocado = doMaterial.stream().map(AlocacaoObra::getQuantidade).reduce(BigDecimal.ZERO, BigDecimal::add);
            materiais.add(new EstoqueObraResponses.MaterialNoLocal(material.getId(), material.getCodigo(), material.getDescricao(),
                    material.getUnidadeMedida(), chave.condicao(), fisico, fisico.subtract(alocado),
                    doMaterial.stream()
                            .sorted(Comparator.comparing(AlocacaoObra::getQuantidade).reversed())
                            .map(a -> new EstoqueObraResponses.ParteDaObra(a.getIdObra(), numeros.get(a.getIdObra()), a.getQuantidade()))
                            .toList()));
        }
        materiais.sort(Comparator.comparing(EstoqueObraResponses.MaterialNoLocal::codigo)
                .thenComparing(EstoqueObraResponses.MaterialNoLocal::condicao));
        return new EstoqueObraResponses.SaldoPorObra(estoque.getId(), estoque.getNomeIdentificador(),
                estoque.getTipoEstoque().getNome(), estoque.getIdEquipe(), materiais);
    }

    private Estoque local(UUID id) {
        return estoqueRepository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Estoque não encontrado."));
    }

    /** Material seriado anda pelos fluxos com série (entrega, devolução técnica, transferência). */
    private Material materialSemSerie(UUID idMaterial) {
        Material material = materialRepository.findById(idMaterial)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado."));
        if (material.isDetalhaSerie()) {
            throw new InvarianteVioladaException("O material " + material.getCodigo()
                    + " controla série: movimente pela transferência ou devolução técnica, informando a série.");
        }
        return material;
    }

    private void exigirFisico(Estoque local, Material material, CondicaoMaterial condicao, BigDecimal quantidade) {
        BigDecimal fisico = saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(local.getId(), material.getId(), condicao)
                .map(Saldo::getQuantidade).orElse(BigDecimal.ZERO);
        if (fisico.compareTo(quantidade) < 0) {
            throw new InvarianteVioladaException("Há só " + texto(fisico.max(BigDecimal.ZERO)) + " "
                    + Objects.toString(material.getUnidadeMedida(), "") + " de " + material.getDescricao()
                    + " em " + local.getNomeIdentificador() + ".");
        }
    }

    private BigDecimal livre(Estoque local, Material material, CondicaoMaterial condicao) {
        BigDecimal fisico = saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(local.getId(), material.getId(), condicao)
                .map(Saldo::getQuantidade).orElse(BigDecimal.ZERO);
        BigDecimal alocado = alocacaoRepository.listarDoMaterialComLock(local.getId(), material.getId(), condicao).stream()
                .map(AlocacaoObra::getQuantidade).reduce(BigDecimal.ZERO, BigDecimal::add);
        return fisico.subtract(alocado).max(BigDecimal.ZERO);
    }

    private void creditar(Estoque estoque, Material material, CondicaoMaterial condicao, BigDecimal quantidade) {
        Saldo saldo = saldoRepository.findWithLockByEstoqueIdAndMaterialIdAndCondicao(estoque.getId(), material.getId(), condicao)
                .orElseGet(() -> new Saldo(estoque, material, condicao));
        saldo.adicionarQuantidade(quantidade);
        saldoRepository.save(saldo);
    }

    private static UUID operador() {
        UUID id = SecurityUtils.getUsuarioLogadoId();
        if (id == null) {
            throw new InvarianteVioladaException("Entre no sistema para movimentar o estoque.");
        }
        return id;
    }

    private static CondicaoMaterial condicao(CondicaoMaterial condicao) {
        return Objects.requireNonNullElse(condicao, CondicaoMaterial.NOVO);
    }

    private static BigDecimal valor(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String texto(BigDecimal v) {
        return v.stripTrailingZeros().toPlainString().replace('.', ',');
    }
}
