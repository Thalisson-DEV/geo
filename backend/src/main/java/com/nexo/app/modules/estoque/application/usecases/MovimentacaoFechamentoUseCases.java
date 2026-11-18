package com.nexo.app.modules.estoque.application.usecases;

import java.util.HashMap;
import com.nexo.app.modules.estoque.domain.QuantidadeConvertida;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraRequests;
import com.nexo.app.modules.estoque.application.dto.FechamentoObraResponses;
import com.nexo.app.modules.estoque.application.services.DebitoSaldoService;
import com.nexo.app.modules.estoque.application.services.IdempotenciaComandoSolicitacaoService;
import com.nexo.app.modules.estoque.application.services.ObservabilidadeSolicitacaoTecnica;
import com.nexo.app.modules.estoque.domain.AlteracaoEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.CondicaoMaterial;
import com.nexo.app.modules.estoque.domain.EfeitoEstoque;
import com.nexo.app.modules.estoque.domain.Estoque;
import com.nexo.app.modules.estoque.domain.ItemOperacaoSolicitacao;
import com.nexo.app.modules.estoque.domain.ItemSolicitacao;
import com.nexo.app.modules.estoque.domain.Material;
import com.nexo.app.modules.estoque.domain.MovimentacaoEstoque;
import com.nexo.app.modules.estoque.domain.OperacaoSolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.Saldo;
import com.nexo.app.modules.estoque.domain.SituacaoFechamentoSolicitacao;
import com.nexo.app.modules.estoque.domain.SolicitacaoMaterial;
import com.nexo.app.modules.estoque.domain.TipoEventoSolicitacao;
import com.nexo.app.modules.estoque.domain.TipoOperacaoSolicitacao;
import com.nexo.app.modules.estoque.infrastructure.persistence.ItemOperacaoSolicitacaoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.MovimentacaoEstoqueRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.OperacaoSolicitacaoMaterialRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SaldoRepository;
import com.nexo.app.modules.estoque.infrastructure.persistence.SolicitacaoMaterialRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.PreenchimentoInvalidoException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import static com.nexo.app.shared.infrastructure.config.CacheNames.SALDOS;

/**
 * Movimentação do fechamento pelo almoxarifado: marcar movimentado (parcial por quantidade),
 * trocar o efeito no estoque e estornar. Falta de saldo nunca barra: o lado que perde fica negativo.
 */
@Service
@RequiredArgsConstructor
public class MovimentacaoFechamentoUseCases {

    private final SolicitacaoMaterialRepository repository;
    private final OperacaoSolicitacaoMaterialRepository operacaoRepository;
    private final ItemOperacaoSolicitacaoRepository itemOperacaoRepository;
    private final MovimentacaoEstoqueRepository movimentacaoRepository;
    private final SaldoRepository saldoRepository;
    private final DebitoSaldoService debitoSaldo;
    private final IdempotenciaComandoSolicitacaoService idempotencia;
    private final FechamentoObraUseCases fechamento;
    private final MontadorFechamentoObra montador;

    /** Resposta guardada para repetir o comando com a mesma chave. */
    public record Resultado(UUID idOperacao) {
    }

    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public Resultado movimentar(
            UUID id,
            FechamentoObraRequests.Movimentar request,
            UUID idUsuario,
            String chaveIdempotencia
    ) {
        Objects.requireNonNull(request, "Os dados da movimentacao sao obrigatorios");
        var consulta = consultar("FECHAMENTO_MOVIMENTAR:" + id, idUsuario, chaveIdempotencia, request);
        if (consulta != null && consulta.repetida()) {
            return consulta.resposta();
        }
        SolicitacaoMaterial solicitacao = fechamento.carregarParaComando(id, request.versaoEsperada());
        solicitacao.exigirMovimentavelNoFechamento();
        Map<UUID, QuantidadeConvertida> informadas = new HashMap<>();
        Map<ItemSolicitacao, BigDecimal> quantidades = validarItensMovimentacao(solicitacao, request.itens(), informadas);

        OperacaoSolicitacaoMaterial operacao = OperacaoSolicitacaoMaterial.criarFechamento(
                solicitacao, TipoOperacaoSolicitacao.MOVIMENTACAO, EfeitoEstoque.FISICO, idUsuario, null, null);
        quantidades.forEach((item, quantidade) ->
                operacao.adicionarItem(item, quantidade, null, CondicaoMaterial.NOVO, null));
        OperacaoSolicitacaoMaterial salva = operacaoRepository.saveAndFlush(operacao);

        List<AlteracaoEventoSolicitacao> alteracoes = new ArrayList<>();
        Map<ItemOperacaoSolicitacao, BigDecimal> efeitos = new LinkedHashMap<>();
        for (ItemOperacaoSolicitacao itemOperacao : salva.getItens()) {
            ItemSolicitacao item = itemOperacao.getItemSolicitacao();
            BigDecimal anterior = item.getQuantidadeOperadaLiquida();
            if (solicitacao.getTipoTecnico().isAdicao()) {
                item.registrarEntregaTecnica(itemOperacao.getQuantidade());
            } else {
                item.registrarDevolucaoTecnica(itemOperacao.getQuantidade());
            }
            alteracoes.add(new AlteracaoEventoSolicitacao(
                    "itens[" + item.getMaterial().getCodigo() + "].quantidadeMovimentada",
                    anterior, item.getQuantidadeOperadaLiquida()));
            efeitos.put(itemOperacao, itemOperacao.getQuantidade());
        }
        if (salva.isFisica()) {
            aplicarSaldo(solicitacao, efeitos, true, idUsuario, informadas);
        }
        SituacaoFechamentoSolicitacao situacaoAnterior = solicitacao.getSituacaoFechamento();
        solicitacao.aplicarMovimentacaoFechamento(OffsetDateTime.now());
        repository.save(solicitacao);
        alteracoes.add(new AlteracaoEventoSolicitacao(
                "situacao", situacaoAnterior, solicitacao.getSituacaoFechamento()));
        fechamento.registrarEvento(solicitacao, TipoEventoSolicitacao.MOVIMENTACAO_CONFIRMADA,
                "MARCAR_MOVIMENTADO", alteracoes,
                Map.of("idOperacao", salva.getId(), "efeitoEstoque", salva.getEfeitoEstoque().name()),
                idUsuario, null);
        return registrar(consulta, solicitacao, salva);
    }

    @Transactional
    @CacheEvict(value = SALDOS, allEntries = true)
    public Resultado estornar(
            UUID id,
            UUID idOperacao,
            FechamentoObraRequests.Estornar request,
            UUID idUsuario,
            String chaveIdempotencia
    ) {
        Objects.requireNonNull(request, "Os dados do estorno sao obrigatorios");
        var consulta = consultar("FECHAMENTO_ESTORNO:" + idOperacao, idUsuario, chaveIdempotencia, request);
        if (consulta != null && consulta.repetida()) {
            return consulta.resposta();
        }
        if (request.motivo() == null || request.motivo().isBlank()) {
            throw new PreenchimentoInvalidoException(Map.of("motivo", "Informe o motivo do estorno."));
        }
        if (request.motivo().trim().length() > 500) {
            throw new PreenchimentoInvalidoException(Map.of("motivo", "O motivo deve ter até 500 caracteres."));
        }
        SolicitacaoMaterial solicitacao = fechamento.carregarParaComando(id, request.versaoEsperada());
        OperacaoSolicitacaoMaterial original = movimentacaoDaSolicitacao(id, idOperacao);
        Map<ItemOperacaoSolicitacao, BigDecimal> pedidos = validarItensEstorno(original, request.itens());

        OperacaoSolicitacaoMaterial estorno = OperacaoSolicitacaoMaterial.criarFechamento(
                solicitacao, TipoOperacaoSolicitacao.ESTORNO, original.getEfeitoEstoque(),
                idUsuario, request.motivo(), original);
        pedidos.forEach((itemOriginal, quantidade) -> estorno.adicionarItem(
                itemOriginal.getItemSolicitacao(), quantidade, null, itemOriginal));
        OperacaoSolicitacaoMaterial salvo = operacaoRepository.saveAndFlush(estorno);

        List<AlteracaoEventoSolicitacao> alteracoes = new ArrayList<>();
        Map<ItemOperacaoSolicitacao, BigDecimal> efeitos = new LinkedHashMap<>();
        for (ItemOperacaoSolicitacao itemEstorno : salvo.getItens()) {
            ItemSolicitacao item = itemEstorno.getItemSolicitacao();
            BigDecimal anterior = item.getQuantidadeOperadaLiquida();
            if (solicitacao.getTipoTecnico().isAdicao()) {
                item.registrarEstornoEntregaTecnica(itemEstorno.getQuantidade());
            } else {
                item.registrarEstornoDevolucaoTecnica(itemEstorno.getQuantidade());
            }
            alteracoes.add(new AlteracaoEventoSolicitacao(
                    "itens[" + item.getMaterial().getCodigo() + "].quantidadeMovimentada",
                    anterior, item.getQuantidadeOperadaLiquida()));
            efeitos.put(itemEstorno, itemEstorno.getQuantidade());
        }
        if (original.isFisica()) {
            aplicarSaldo(solicitacao, efeitos, false, idUsuario);
        }
        SituacaoFechamentoSolicitacao situacaoAnterior = solicitacao.getSituacaoFechamento();
        solicitacao.aplicarMovimentacaoFechamento(OffsetDateTime.now());
        repository.save(solicitacao);
        alteracoes.add(new AlteracaoEventoSolicitacao(
                "situacao", situacaoAnterior, solicitacao.getSituacaoFechamento()));
        fechamento.registrarEvento(solicitacao, TipoEventoSolicitacao.ESTORNO_CONFIRMADO,
                "ESTORNAR_MOVIMENTACAO", alteracoes,
                Map.of("idOperacao", salvo.getId(), "idOperacaoOriginal", original.getId()),
                idUsuario, request.motivo());
        return registrar(consulta, solicitacao, salvo);
    }

    /** Saldo resultante, por material, se a movimentação for confirmada. */
    @Transactional(readOnly = true)
    public FechamentoObraResponses.Previa previaMovimentacao(UUID id, FechamentoObraRequests.Movimentar request) {
        SolicitacaoMaterial solicitacao = carregar(id);
        if (request == null) {
            return new FechamentoObraResponses.Previa(false, List.of());
        }
        Map<Material, BigDecimal> totais = new LinkedHashMap<>();
        validarItensMovimentacao(solicitacao, request.itens())
                .forEach((item, quantidade) -> totais.merge(item.getMaterial(), quantidade, BigDecimal::add));
        return previa(solicitacao, totais, true);
    }

    /** Saldo resultante, por material, se o estorno for confirmado. */
    @Transactional(readOnly = true)
    public FechamentoObraResponses.Previa previaEstorno(
            UUID id, UUID idOperacao, FechamentoObraRequests.Estornar request) {
        SolicitacaoMaterial solicitacao = carregar(id);
        OperacaoSolicitacaoMaterial original = movimentacaoDaSolicitacao(id, idOperacao);
        if (!original.isFisica() || request == null) {
            return new FechamentoObraResponses.Previa(false, List.of());
        }
        Map<Material, BigDecimal> totais = new LinkedHashMap<>();
        validarItensEstorno(original, request.itens())
                .forEach((item, quantidade) -> totais.merge(item.getMaterial(), quantidade, BigDecimal::add));
        return previa(solicitacao, totais, false);
    }

    // --- Saldo ----------------------------------------------------------------

    /**
     * Move o saldo entre almoxarifado e obra. {@code direto}: no sentido do tipo (221/921 do
     * almoxarifado para a obra; 222/922 da obra para o almoxarifado); senão, o inverso.
     */
    private void aplicarSaldo(
            SolicitacaoMaterial solicitacao,
            Map<ItemOperacaoSolicitacao, BigDecimal> quantidades,
            boolean direto,
            UUID idUsuario
    ) {
        aplicarSaldo(solicitacao, quantidades, direto, idUsuario, Map.of());
    }

    private void aplicarSaldo(
            SolicitacaoMaterial solicitacao,
            Map<ItemOperacaoSolicitacao, BigDecimal> quantidades,
            boolean direto,
            UUID idUsuario,
            Map<UUID, QuantidadeConvertida> informadas
    ) {
        Sentido sentido = sentido(solicitacao, direto);
        MovimentacaoEstoque.TipoMovimentacao tipo = !direto
                ? MovimentacaoEstoque.TipoMovimentacao.ESTORNO
                : solicitacao.getTipoTecnico().isAdicao()
                        ? MovimentacaoEstoque.TipoMovimentacao.ENTREGA
                        : MovimentacaoEstoque.TipoMovimentacao.DEVOLUCAO;
        quantidades.entrySet().stream()
                .sorted(Comparator.comparing(entrada -> entrada.getKey().getMaterial().getId().toString()))
                .forEach(entrada -> {
                    ItemOperacaoSolicitacao item = entrada.getKey();
                    BigDecimal quantidade = entrada.getValue();
                    debitoSaldo.debitar(sentido.origem(), item.getMaterial(), CondicaoMaterial.NOVO, quantidade);
                    creditar(sentido.destino(), item.getMaterial(), quantidade);
                    MovimentacaoEstoque movimentacao = MovimentacaoEstoque.criarFechamento(
                            sentido.origem(), sentido.destino(), item, quantidade, tipo, idUsuario);
                    movimentacao.registrarQuantidadeInformada(informadas.get(item.getItemSolicitacao().getId()));
                    movimentacaoRepository.save(movimentacao);
                });
    }

    private void creditar(Estoque estoque, Material material, BigDecimal quantidade) {
        Saldo saldo = saldoRepository.findWithLockByEstoqueIdAndMaterialIdAndCondicao(
                        estoque.getId(), material.getId(), CondicaoMaterial.NOVO)
                .orElseGet(() -> saldoRepository.saveAndFlush(new Saldo(estoque, material, CondicaoMaterial.NOVO)));
        saldo.adicionarQuantidade(quantidade);
        saldoRepository.save(saldo);
    }

    private FechamentoObraResponses.Previa previa(
            SolicitacaoMaterial solicitacao,
            Map<Material, BigDecimal> totais,
            boolean direto
    ) {
        Sentido sentido = sentido(solicitacao, direto);
        List<FechamentoObraResponses.LinhaPrevia> linhas = new ArrayList<>();
        totais.forEach((material, quantidade) -> {
            linhas.add(linha(material, sentido.origem(), quantidade.negate()));
            linhas.add(linha(material, sentido.destino(), quantidade));
        });
        boolean negativo = linhas.stream().anyMatch(linha -> linha.saldoResultante().signum() < 0);
        return new FechamentoObraResponses.Previa(negativo, linhas);
    }

    private FechamentoObraResponses.LinhaPrevia linha(Material material, Estoque estoque, BigDecimal variacao) {
        BigDecimal atual = saldoRepository.findByEstoqueIdAndMaterialIdAndCondicao(
                        estoque.getId(), material.getId(), CondicaoMaterial.NOVO)
                .map(Saldo::getQuantidade)
                .orElse(BigDecimal.ZERO);
        return new FechamentoObraResponses.LinhaPrevia(
                material.getId(), material.getCodigo(), material.getDescricao(),
                new FechamentoObraResponses.Estoque(estoque.getId(), estoque.getNomeIdentificador()),
                atual, variacao, atual.add(variacao));
    }

    private static Sentido sentido(SolicitacaoMaterial solicitacao, boolean direto) {
        Estoque almoxarifado = solicitacao.getAlmoxarifadoAtendimento();
        Estoque obra = MontadorFechamentoObra.estoqueObra(solicitacao);
        boolean doAlmoxarifadoParaObra = solicitacao.getTipoTecnico().isAdicao() == direto;
        return doAlmoxarifadoParaObra ? new Sentido(almoxarifado, obra) : new Sentido(obra, almoxarifado);
    }

    private record Sentido(Estoque origem, Estoque destino) {
    }

    // --- Validações -----------------------------------------------------------

    private Map<ItemSolicitacao, BigDecimal> validarItensMovimentacao(
            SolicitacaoMaterial solicitacao,
            List<FechamentoObraRequests.Movimentar.Item> itens
    ) {
        return validarItensMovimentacao(solicitacao, itens, new HashMap<>());
    }

    private Map<ItemSolicitacao, BigDecimal> validarItensMovimentacao(
            SolicitacaoMaterial solicitacao,
            List<FechamentoObraRequests.Movimentar.Item> itens,
            Map<UUID, QuantidadeConvertida> informadas
    ) {
        if (itens == null || itens.isEmpty()) {
            throw new PreenchimentoInvalidoException(Map.of("itens", "Informe a quantidade de ao menos um material."));
        }
        Map<String, String> erros = new LinkedHashMap<>();
        Map<ItemSolicitacao, BigDecimal> quantidades = new LinkedHashMap<>();
        Set<UUID> vistos = new HashSet<>();
        for (int indice = 0; indice < itens.size(); indice++) {
            FechamentoObraRequests.Movimentar.Item requisicao = itens.get(indice);
            String campo = "itens[" + indice + "].quantidade";
            ItemSolicitacao item = solicitacao.getItens().stream()
                    .filter(candidato -> candidato.getId().equals(requisicao.idItem()))
                    .findFirst()
                    .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado nesta solicitação."));
            if (!vistos.add(item.getId())) {
                erros.put(campo, "Material informado mais de uma vez.");
                continue;
            }
            if (requisicao.quantidade() == null || requisicao.quantidade().signum() <= 0) {
                erros.put(campo, "Informe uma quantidade positiva.");
                continue;
            }
            QuantidadeConvertida convertida = item.getMaterial().converterParaBase(requisicao.quantidade(), requisicao.unidade());
            BigDecimal quantidade = convertida.base();
            if (convertida.convertida()) {
                informadas.put(item.getId(), convertida);
            }
            BigDecimal pendente = item.getQuantidadePendente();
            if (quantidade.compareTo(pendente) > 0) {
                erros.put(campo, "Restam " + pendente.max(BigDecimal.ZERO).stripTrailingZeros().toPlainString()
                        + " a movimentar deste material.");
                continue;
            }
            quantidades.put(item, quantidade);
        }
        if (!erros.isEmpty()) {
            throw new PreenchimentoInvalidoException(erros);
        }
        return quantidades;
    }

    private Map<ItemOperacaoSolicitacao, BigDecimal> validarItensEstorno(
            OperacaoSolicitacaoMaterial original,
            List<FechamentoObraRequests.Estornar.Item> itens
    ) {
        if (itens == null || itens.isEmpty()) {
            throw new PreenchimentoInvalidoException(Map.of("itens", "Informe a quantidade a estornar de ao menos um material."));
        }
        Map<String, String> erros = new LinkedHashMap<>();
        Map<ItemOperacaoSolicitacao, BigDecimal> pedidos = new LinkedHashMap<>();
        for (int indice = 0; indice < itens.size(); indice++) {
            FechamentoObraRequests.Estornar.Item requisicao = itens.get(indice);
            String campo = "itens[" + indice + "].quantidade";
            ItemOperacaoSolicitacao itemOriginal = original.getItens().stream()
                    .filter(candidato -> candidato.getId().equals(requisicao.idItemOperacao()))
                    .findFirst()
                    .orElseThrow(() -> new RecursoNaoEncontradoException("Material não encontrado nesta movimentação."));
            if (pedidos.containsKey(itemOriginal)) {
                erros.put(campo, "Material informado mais de uma vez.");
                continue;
            }
            BigDecimal quantidade = requisicao.quantidade();
            if (quantidade == null || quantidade.signum() <= 0) {
                erros.put(campo, "Informe uma quantidade positiva.");
                continue;
            }
            BigDecimal estornavel = montador.estornavel(itemOriginal);
            if (quantidade.compareTo(estornavel) > 0) {
                erros.put(campo, "Dá para estornar até " + estornavel.stripTrailingZeros().toPlainString()
                        + " deste material nesta movimentação.");
                continue;
            }
            pedidos.put(itemOriginal, quantidade);
        }
        if (!erros.isEmpty()) {
            throw new PreenchimentoInvalidoException(erros);
        }
        return pedidos;
    }

    /** Quantidade de cada item da movimentação que ainda não foi estornada. */
    private Map<ItemOperacaoSolicitacao, BigDecimal> restantes(OperacaoSolicitacaoMaterial operacao) {
        Map<ItemOperacaoSolicitacao, BigDecimal> restantes = new LinkedHashMap<>();
        for (ItemOperacaoSolicitacao item : operacao.getItens()) {
            BigDecimal restante = montador.estornavel(item);
            if (restante.signum() > 0) {
                restantes.put(item, restante);
            }
        }
        return restantes;
    }

    private OperacaoSolicitacaoMaterial movimentacaoDaSolicitacao(UUID idSolicitacao, UUID idOperacao) {
        return operacaoRepository.findById(idOperacao)
                .filter(operacao -> operacao.getSolicitacao().getId().equals(idSolicitacao))
                .filter(operacao -> operacao.getTipo() == TipoOperacaoSolicitacao.MOVIMENTACAO)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Movimentação não encontrada nesta solicitação."));
    }

    private SolicitacaoMaterial carregar(UUID id) {
        return repository.findById(id)
                .filter(SolicitacaoMaterial::isFechamento)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Solicitação de encerramento não encontrada."));
    }

    private IdempotenciaComandoSolicitacaoService.Consulta<Resultado> consultar(
            String escopo, UUID idUsuario, String chave, Object payload) {
        if (chave == null) {
            return null;
        }
        return idempotencia.consultar(escopo, idUsuario, chave, payload, Resultado.class,
                ObservabilidadeSolicitacaoTecnica.Operacao.ENTREGA);
    }

    private Resultado registrar(
            IdempotenciaComandoSolicitacaoService.Consulta<Resultado> consulta,
            SolicitacaoMaterial solicitacao,
            OperacaoSolicitacaoMaterial operacao
    ) {
        Resultado resultado = new Resultado(operacao.getId());
        if (consulta != null) {
            idempotencia.registrar(consulta, solicitacao.getId(), operacao.getId(), resultado);
        }
        return resultado;
    }
}
