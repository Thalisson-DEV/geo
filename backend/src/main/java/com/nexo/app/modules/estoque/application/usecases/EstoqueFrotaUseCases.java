package com.nexo.app.modules.estoque.application.usecases;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque.TipoMovimentacao;
import com.nexo.app.modules.estoque.domain.ParametroMaterialEstoque;
import com.nexo.app.modules.estoque.domain.Saldo;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueFrotaSpecification;
import com.nexo.app.modules.estoque.infrastructure.persistence.EstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MovimentacaoEstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.ParametroMaterialEstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.TipoEstoqueRepository;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Estoque da oficina da frota sobre o estoque existente: almoxarifados do tipo FROTA, peças do
 * catálogo FROTA, saldo com custo médio ponderado e movimentações com motivo, documento e veículo.
 */
@Service
@RequiredArgsConstructor
public class EstoqueFrotaUseCases implements EstoqueFrotaApi {

    private static final CondicaoMaterial CONDICAO = CondicaoMaterial.NOVO;

    private final EstoqueRepository estoques;
    private final TipoEstoqueRepository tipos;
    private final MaterialRepository materiais;
    private final SaldoRepository saldos;
    private final MovimentacaoEstoqueRepository movimentacoes;
    private final ParametroMaterialEstoqueRepository parametros;

    // ── Almoxarifados ────────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public List<Almoxarifado> almoxarifados() {
        return estoques.findAllByTipoEstoqueNomeOrderByNomeIdentificadorAsc(Estoque.TIPO_FROTA).stream()
                .map(EstoqueFrotaUseCases::almoxarifado).toList();
    }

    @Override
    @Transactional
    public Almoxarifado criarAlmoxarifado(String nome, UUID idBaseOperacional) {
        var tipo = tipos.findByNomeIgnoreCase(Estoque.TIPO_FROTA)
                .orElseThrow(() -> new InvarianteVioladaException("O tipo de estoque FROTA não está cadastrado."));
        exigirNomeLivre(nome, null);
        var estoque = new Estoque(nome, tipo);
        if (idBaseOperacional != null) {
            estoque.vincularBaseOperacional(idBaseOperacional);
        }
        return almoxarifado(estoques.save(estoque));
    }

    @Override
    @Transactional
    public Almoxarifado atualizarAlmoxarifado(UUID id, String nome, UUID idBaseOperacional) {
        var estoque = estoqueFrota(id);
        exigirNomeLivre(nome, id);
        estoque.atualizarNome(nome);
        if (idBaseOperacional != null) {
            estoque.vincularBaseOperacional(idBaseOperacional);
        }
        return almoxarifado(estoques.save(estoque));
    }

    @Override
    @Transactional
    public void desativarAlmoxarifado(UUID id) {
        var estoque = estoqueFrota(id);
        if (saldos.findAllByEstoqueIdAndAtivoTrue(id).stream().anyMatch(s -> s.getQuantidade().signum() != 0)) {
            throw new InvarianteVioladaException("O " + estoque.getNomeIdentificador()
                    + " ainda tem peças. Transfira ou ajuste o saldo antes de desativar.");
        }
        estoque.desativar();
        estoques.save(estoque);
    }

    @Override
    @Transactional(readOnly = true)
    public Almoxarifado almoxarifado(UUID id) {
        return almoxarifado(estoqueFrota(id));
    }

    // ── Catálogo ─────────────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public PageResponse<Peca> pecas(String busca, String grupo, Boolean ativo, Pageable pageable) {
        Page<Material> pagina = materiais.findAll(EstoqueFrotaSpecification.pecas(busca, grupo, ativo), pageable);
        Map<UUID, BigDecimal> totais = saldos.findAllByEstoqueTipoEstoqueNomeAndAtivoTrue(Estoque.TIPO_FROTA).stream()
                .collect(Collectors.toMap(s -> s.getMaterial().getId(), Saldo::getQuantidade, BigDecimal::add));
        return PageResponse.fromPage(pagina.map(m -> peca(m, totais.getOrDefault(m.getId(), BigDecimal.ZERO))));
    }

    @Override
    @Transactional(readOnly = true)
    public Peca peca(UUID id) {
        var material = pecaFrota(id);
        BigDecimal total = saldos.findAllByEstoqueTipoEstoqueNomeAndAtivoTrue(Estoque.TIPO_FROTA).stream()
                .filter(s -> s.getMaterial().getId().equals(id)).map(Saldo::getQuantidade).reduce(BigDecimal.ZERO, BigDecimal::add);
        return peca(material, total);
    }

    @Override
    @Transactional
    public Peca criarPeca(DadosPeca dados) {
        exigirCodigoLivre(dados.codigo(), null);
        var material = Material.pecaFrota(dados.codigo(), dados.descricao(), dados.unidade(), dados.grupo());
        return peca(materiais.save(material), BigDecimal.ZERO);
    }

    @Override
    @Transactional
    public Peca atualizarPeca(UUID id, DadosPeca dados) {
        var material = pecaFrota(id);
        exigirCodigoLivre(dados.codigo(), id);
        material.atualizarPecaFrota(dados.codigo(), dados.descricao(), dados.unidade(), dados.grupo());
        return peca(id);
    }

    @Override
    @Transactional
    public void desativarPeca(UUID id) {
        var material = pecaFrota(id);
        if (saldos.existsSaldoNaoZeradoByMaterialId(id)) {
            throw new InvarianteVioladaException("A peça " + material.getCodigo() + " ainda tem saldo. Zere o saldo antes de desativar.");
        }
        material.desativar();
        materiais.save(material);
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> grupos() {
        return materiais.gruposFrota();
    }

    // ── Saldos ───────────────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public List<SaldoPeca> saldos(UUID idEstoque) {
        List<Saldo> lista = idEstoque == null
                ? saldos.findAllByEstoqueTipoEstoqueNomeAndAtivoTrue(Estoque.TIPO_FROTA)
                : saldos.findAllByEstoqueIdAndAtivoTrue(estoqueFrota(idEstoque).getId());
        Set<UUID> idsEstoque = lista.stream().map(s -> s.getEstoque().getId()).collect(Collectors.toSet());
        Map<String, ParametroMaterialEstoque> porChave = idsEstoque.isEmpty() ? Map.of()
                : parametros.findAllByIdEstoqueIn(idsEstoque).stream()
                .collect(Collectors.toMap(p -> chave(p.getIdEstoque(), p.getIdMaterial()), Function.identity()));
        return lista.stream()
                .filter(s -> s.getMaterial().isCatalogoFrota() && s.getEstoque().isAtivo())
                .map(s -> saldoPeca(s, porChave.get(chave(s.getEstoque().getId(), s.getMaterial().getId()))))
                .sorted(Comparator.comparing(SaldoPeca::descricao, String.CASE_INSENSITIVE_ORDER).thenComparing(SaldoPeca::estoque))
                .toList();
    }

    @Override
    @Transactional
    public SaldoPeca definirParametros(UUID idEstoque, UUID idMaterial, BigDecimal estoqueMinimo, String localizacao) {
        var estoque = estoqueFrota(idEstoque);
        var material = pecaFrota(idMaterial);
        var saldo = saldos.findByEstoqueIdAndMaterialIdAndCondicao(idEstoque, idMaterial, CONDICAO)
                .orElseGet(() -> saldos.save(new Saldo(estoque, material, CONDICAO)));
        var parametro = parametros.findByIdEstoqueAndIdMaterial(idEstoque, idMaterial)
                .orElseGet(() -> new ParametroMaterialEstoque(idEstoque, idMaterial));
        parametro.definir(estoqueMinimo, localizacao);
        return saldoPeca(saldo, parametros.save(parametro));
    }

    @Override
    @Transactional(readOnly = true)
    public Resumo resumo(UUID idEstoque, OffsetDateTime desde) {
        List<SaldoPeca> lista = saldos(idEstoque);
        BigDecimal valorTotal = lista.stream().map(SaldoPeca::valorTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        long abaixo = lista.stream().filter(SaldoPeca::abaixoMinimo).count();
        long semSaldo = lista.stream().filter(s -> s.quantidade().signum() <= 0).count();
        var recentes = movimentacoes.findAll(EstoqueFrotaSpecification.movimentos(idEstoque, null, null, null,
                null, null, desde, null));
        BigDecimal entradas = BigDecimal.ZERO;
        BigDecimal saidas = BigDecimal.ZERO;
        for (var m : recentes) {
            BigDecimal valor = valor(m);
            if (m.getTipo() == TipoMovimentacao.ENTRADA_AVULSA && !isAjuste(m)) {
                entradas = entradas.add(valor);
            } else if (m.getTipo() == TipoMovimentacao.BAIXA_AVULSA && !isAjuste(m)) {
                saidas = saidas.add(valor);
            }
        }
        return new Resumo(lista.size(), valorTotal, entradas, saidas, abaixo, semSaldo);
    }

    // ── Movimentações ────────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public PageResponse<Movimento> movimentos(FiltroMovimentos f, Pageable pageable) {
        Page<MovimentacaoEstoque> pagina = movimentacoes.findAll(EstoqueFrotaSpecification.movimentos(f.idEstoque(), f.idMaterial(),
                f.idVeiculo(), f.idReferencia(), f.tipos(), f.busca(), f.de(), f.ate()), pageable);
        Set<UUID> estornados = estornados(pagina.getContent());
        return PageResponse.fromPage(pagina.map(m -> movimento(m, estornados)));
    }

    @Override
    @Transactional(readOnly = true)
    public List<Movimento> movimentosDaReferencia(UUID idReferencia) {
        var lista = movimentacoes.findAll(EstoqueFrotaSpecification.movimentos(null, null, null, idReferencia,
                null, null, null, null));
        Set<UUID> estornados = estornados(lista);
        return lista.stream().sorted(Comparator.comparing(MovimentacaoEstoque::getDataHora))
                .map(m -> movimento(m, estornados)).toList();
    }

    @Override
    @Transactional
    public UUID entrada(UUID idEstoque, List<ItemEntrada> itens, Contexto contexto, UUID idUsuario, OffsetDateTime dataHora) {
        exigirItens(itens);
        Motivo motivo = contexto.motivo() == null ? Motivo.COMPRA : contexto.motivo();
        if (!motivo.isEntrada()) {
            throw new InvarianteVioladaException("Motivo de entrada inválido: " + motivo.getRotulo() + ".");
        }
        var estoque = estoqueFrota(idEstoque);
        UUID lote = contexto.idReferencia() != null ? contexto.idReferencia() : UUID.randomUUID();
        exigirSemRepeticao(itens.stream().map(ItemEntrada::idMaterial).toList());
        for (var item : itens) {
            var material = pecaFrota(item.idMaterial());
            exigirQuantidade(item.quantidade());
            if (item.valorUnitario() == null || item.valorUnitario().signum() < 0) {
                throw new InvarianteVioladaException("Informe o valor unitário de " + material.getDescricao() + ".");
            }
            saldoComTrava(estoque, material).adicionarComCusto(item.quantidade(), item.valorUnitario());
            movimentacoes.save(MovimentacaoEstoque.criarFrota(null, estoque, material, item.quantidade(), TipoMovimentacao.ENTRADA_AVULSA,
                    item.valorUnitario().setScale(4, RoundingMode.HALF_UP), contexto(contexto, motivo, lote), idUsuario, dataHora));
        }
        return lote;
    }

    @Override
    @Transactional
    public List<Movimento> saida(UUID idEstoque, List<ItemSaida> itens, Contexto contexto, UUID idUsuario, OffsetDateTime dataHora) {
        exigirItens(itens);
        Motivo motivo = contexto.motivo() == null ? Motivo.USO_OFICINA : contexto.motivo();
        if (!motivo.isSaida()) {
            throw new InvarianteVioladaException("Motivo de saída inválido: " + motivo.getRotulo() + ".");
        }
        if ((motivo == Motivo.VEICULO || motivo == Motivo.ORDEM_SERVICO) && contexto.idVeiculo() == null && contexto.idReferencia() == null) {
            throw new InvarianteVioladaException("Escolha o veículo que recebeu a peça.");
        }
        var estoque = estoqueFrota(idEstoque);
        exigirSemRepeticao(itens.stream().map(ItemSaida::idMaterial).toList());
        List<Movimento> feitos = new ArrayList<>();
        for (var item : itens) {
            var material = pecaFrota(item.idMaterial());
            exigirQuantidade(item.quantidade());
            var saldo = saldoExistente(estoque, material);
            BigDecimal custo = saldo.custoMedioOuZero();
            saldo.removerSemNegativar(item.quantidade());
            var mov = movimentacoes.save(MovimentacaoEstoque.criarFrota(estoque, null, material, item.quantidade(),
                    TipoMovimentacao.BAIXA_AVULSA, custo, contexto(contexto, motivo, contexto.idReferencia()), idUsuario, dataHora));
            feitos.add(movimento(mov, Set.of()));
        }
        return feitos;
    }

    @Override
    @Transactional
    public UUID transferencia(UUID idOrigem, UUID idDestino, List<ItemSaida> itens, String observacao, UUID idUsuario, OffsetDateTime dataHora) {
        exigirItens(itens);
        if (Objects.equals(idOrigem, idDestino)) {
            throw new InvarianteVioladaException("Escolha almoxarifados diferentes para a transferência.");
        }
        var origem = estoqueFrota(idOrigem);
        var destino = estoqueFrota(idDestino);
        exigirSemRepeticao(itens.stream().map(ItemSaida::idMaterial).toList());
        UUID lote = UUID.randomUUID();
        var contexto = new MovimentacaoEstoque.ContextoFrota(Motivo.TRANSFERENCIA.name(), null, observacao, null, null, lote);
        for (var item : itens) {
            var material = pecaFrota(item.idMaterial());
            exigirQuantidade(item.quantidade());
            var saldoOrigem = saldoExistente(origem, material);
            BigDecimal custo = saldoOrigem.custoMedioOuZero();
            saldoOrigem.removerSemNegativar(item.quantidade());
            saldoComTrava(destino, material).adicionarComCusto(item.quantidade(), custo);
            movimentacoes.save(MovimentacaoEstoque.criarFrota(origem, destino, material, item.quantidade(), TipoMovimentacao.TRANSFERENCIA,
                    custo, contexto, idUsuario, dataHora));
        }
        return lote;
    }

    @Override
    @Transactional
    public Movimento ajuste(UUID idEstoque, UUID idMaterial, BigDecimal quantidadeContada, String observacao, UUID idUsuario,
                            OffsetDateTime dataHora) {
        if (quantidadeContada == null || quantidadeContada.signum() < 0) {
            throw new InvarianteVioladaException("Informe a quantidade contada (zero ou mais).");
        }
        var estoque = estoqueFrota(idEstoque);
        var material = pecaFrota(idMaterial);
        var saldo = saldoComTrava(estoque, material);
        BigDecimal diferenca = quantidadeContada.subtract(saldo.getQuantidade());
        if (diferenca.signum() == 0) {
            return null;
        }
        BigDecimal custo = saldo.custoMedioOuZero();
        var contexto = new MovimentacaoEstoque.ContextoFrota(Motivo.AJUSTE_INVENTARIO.name(), null, observacao, null, null, null);
        MovimentacaoEstoque mov;
        if (diferenca.signum() > 0) {
            saldo.adicionarComCusto(diferenca, custo);
            mov = MovimentacaoEstoque.criarFrota(null, estoque, material, diferenca, TipoMovimentacao.ENTRADA_AVULSA, custo, contexto,
                    idUsuario, dataHora);
        } else {
            saldo.removerQuantidade(diferenca.negate());
            mov = MovimentacaoEstoque.criarFrota(estoque, null, material, diferenca.negate(), TipoMovimentacao.BAIXA_AVULSA, custo, contexto,
                    idUsuario, dataHora);
        }
        return movimento(movimentacoes.save(mov), Set.of());
    }

    @Override
    @Transactional
    public Movimento estornarSaida(UUID idMovimentacao, String observacao, UUID idUsuario, OffsetDateTime dataHora) {
        var saida = movimentacoes.findById(idMovimentacao)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Movimentação não encontrada."));
        if (!saida.getMaterial().isCatalogoFrota() || saida.getTipo() != TipoMovimentacao.BAIXA_AVULSA || saida.getEstoqueOrigem() == null) {
            throw new InvarianteVioladaException("Só uma saída do estoque da frota pode ser estornada.");
        }
        if (movimentacoes.existsByTipoAndIdReferenciaOperacao(TipoMovimentacao.ESTORNO, saida.getId())) {
            throw new InvarianteVioladaException("Essa saída já foi estornada.");
        }
        var estoque = saida.getEstoqueOrigem();
        if (!estoque.isAtivo()) {
            throw new InvarianteVioladaException("O " + estoque.getNomeIdentificador() + " está desativado; não recebe o estorno.");
        }
        BigDecimal valor = saida.getValorUnitario() == null ? BigDecimal.ZERO : saida.getValorUnitario();
        saldoComTrava(estoque, saida.getMaterial()).adicionarComCusto(saida.getQuantidade(), valor);
        var contexto = new MovimentacaoEstoque.ContextoFrota(Motivo.ESTORNO.name(), saida.getDocumento(), observacao,
                saida.getIdVeiculo(), null, saida.getId());
        return movimento(movimentacoes.save(MovimentacaoEstoque.criarFrota(null, estoque, saida.getMaterial(), saida.getQuantidade(),
                TipoMovimentacao.ESTORNO, valor, contexto, idUsuario, dataHora)), Set.of());
    }

    // ── Apoio ────────────────────────────────────────────────────────────────────────

    private Estoque estoqueFrota(UUID id) {
        if (id == null) {
            throw new InvarianteVioladaException("Escolha o almoxarifado da frota.");
        }
        return estoques.findById(id).filter(Estoque::isTipoFrota).filter(Estoque::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Almoxarifado da frota não encontrado."));
    }

    private Material pecaFrota(UUID id) {
        if (id == null) {
            throw new InvarianteVioladaException("Escolha a peça.");
        }
        return materiais.findById(id).filter(Material::isCatalogoFrota)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Peça da frota não encontrada."));
    }

    private Saldo saldoComTrava(Estoque estoque, Material material) {
        return saldos.findWithLockByEstoqueIdAndMaterialIdAndCondicao(estoque.getId(), material.getId(), CONDICAO)
                .orElseGet(() -> saldos.saveAndFlush(new Saldo(estoque, material, CONDICAO)));
    }

    private Saldo saldoExistente(Estoque estoque, Material material) {
        return saldos.findWithLockByEstoqueIdAndMaterialIdAndCondicao(estoque.getId(), material.getId(), CONDICAO)
                .orElseThrow(() -> new InvarianteVioladaException("Não há " + material.getDescricao() + " no "
                        + estoque.getNomeIdentificador() + "."));
    }

    private void exigirNomeLivre(String nome, UUID id) {
        if (nome == null || nome.isBlank()) {
            throw new InvarianteVioladaException("Informe o nome do almoxarifado.");
        }
        estoques.findByNomeIdentificadorIgnoreCase(nome.trim()).filter(e -> !e.getId().equals(id)).ifPresent(e -> {
            throw new InvarianteVioladaException("Já existe um estoque chamado " + e.getNomeIdentificador() + ".");
        });
    }

    private void exigirCodigoLivre(String codigo, UUID id) {
        if (codigo == null || codigo.isBlank()) {
            throw new InvarianteVioladaException("Informe o código da peça.");
        }
        boolean emUso = id == null ? materiais.existsByCodigoIgnoreCase(codigo.trim())
                : materiais.existsByCodigoIgnoreCaseAndIdNot(codigo.trim(), id);
        if (emUso) {
            throw new InvarianteVioladaException("O código " + codigo.trim().toUpperCase() + " já está em uso por outro material.");
        }
    }

    private static void exigirItens(List<?> itens) {
        if (itens == null || itens.isEmpty()) {
            throw new InvarianteVioladaException("Inclua ao menos uma peça.");
        }
    }

    private static void exigirSemRepeticao(List<UUID> ids) {
        Set<UUID> vistos = new HashSet<>();
        for (UUID id : ids) {
            if (!vistos.add(id)) {
                throw new InvarianteVioladaException("A mesma peça aparece duas vezes. Junte as quantidades numa linha só.");
            }
        }
    }

    private static void exigirQuantidade(BigDecimal quantidade) {
        if (quantidade == null || quantidade.signum() <= 0) {
            throw new InvarianteVioladaException("Informe uma quantidade maior que zero.");
        }
    }

    private static MovimentacaoEstoque.ContextoFrota contexto(Contexto c, Motivo motivo, UUID referencia) {
        return new MovimentacaoEstoque.ContextoFrota(motivo.name(), c.documento(), c.observacao(), c.idVeiculo(), c.idFornecedor(), referencia);
    }

    private Set<UUID> estornados(List<MovimentacaoEstoque> lista) {
        var saidas = lista.stream().filter(m -> m.getTipo() == TipoMovimentacao.BAIXA_AVULSA).map(MovimentacaoEstoque::getId).toList();
        if (saidas.isEmpty()) {
            return Set.of();
        }
        return movimentacoes.findAllByTipoAndIdReferenciaOperacaoIn(TipoMovimentacao.ESTORNO, saidas).stream()
                .map(MovimentacaoEstoque::getIdReferenciaOperacao).collect(Collectors.toSet());
    }

    private static boolean isAjuste(MovimentacaoEstoque m) {
        return Motivo.AJUSTE_INVENTARIO.name().equals(m.getMotivo());
    }

    private static BigDecimal valor(MovimentacaoEstoque m) {
        return m.getValorUnitario() == null ? BigDecimal.ZERO
                : m.getValorUnitario().multiply(m.getQuantidade()).setScale(2, RoundingMode.HALF_UP);
    }

    private static String chave(UUID estoque, UUID material) {
        return estoque + ":" + material;
    }

    private static Almoxarifado almoxarifado(Estoque e) {
        return new Almoxarifado(e.getId(), e.getNomeIdentificador(), e.getIdBaseOperacional(), e.isAtivo());
    }

    private static Peca peca(Material m, BigDecimal total) {
        return new Peca(m.getId(), m.getCodigo(), m.getDescricao(), m.getUnidadeMedida(), m.getGrupo(), m.isAtivo(), total);
    }

    private static SaldoPeca saldoPeca(Saldo s, ParametroMaterialEstoque p) {
        var m = s.getMaterial();
        BigDecimal custo = s.getCustoMedio();
        BigDecimal valor = custo == null ? BigDecimal.ZERO : custo.multiply(s.getQuantidade().max(BigDecimal.ZERO)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal minimo = p == null ? null : p.getEstoqueMinimo();
        boolean abaixo = minimo != null && minimo.signum() > 0 && s.getQuantidade().compareTo(minimo) < 0;
        return new SaldoPeca(s.getEstoque().getId(), s.getEstoque().getNomeIdentificador(), m.getId(), m.getCodigo(), m.getDescricao(),
                m.getUnidadeMedida(), m.getGrupo(), s.getQuantidade(), custo, valor, minimo, p == null ? null : p.getLocalizacao(), abaixo);
    }

    private static Movimento movimento(MovimentacaoEstoque m, Set<UUID> estornados) {
        Motivo motivo = m.getMotivoFrota() == null ? null : Motivo.valueOf(m.getMotivoFrota());
        String tipo = switch (m.getTipo()) {
            case ENTRADA_AVULSA -> motivo == Motivo.AJUSTE_INVENTARIO ? "AJUSTE" : "ENTRADA";
            case BAIXA_AVULSA -> motivo == Motivo.AJUSTE_INVENTARIO ? "AJUSTE" : "SAIDA";
            case TRANSFERENCIA -> "TRANSFERENCIA";
            case ESTORNO -> "ESTORNO";
            default -> m.getTipo().name();
        };
        var origem = m.getEstoqueOrigem();
        var destino = m.getEstoqueDestino();
        var material = m.getMaterial();
        return new Movimento(m.getId(), m.getDataHora(), tipo, motivo,
                origem == null ? null : origem.getId(), origem == null ? null : origem.getNomeIdentificador(),
                destino == null ? null : destino.getId(), destino == null ? null : destino.getNomeIdentificador(),
                material.getId(), material.getCodigo(), material.getDescricao(), material.getUnidadeMedida(), m.getQuantidade(),
                m.getValorUnitario(), valor(m), m.getDocumento(), m.getObservacao(), m.getIdVeiculo(), m.getIdFornecedor(),
                m.getIdReferenciaOperacao(), m.getIdUsuarioOperador(), estornados.contains(m.getId()));
    }
}
