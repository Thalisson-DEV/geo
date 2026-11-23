package com.nexo.app.modules.obras.application.usecases;

import com.nexo.app.modules.contrato.AcaoResponse;
import com.nexo.app.modules.contrato.ContratoApi;
import com.nexo.app.modules.estoque.EstoqueApi;
import com.nexo.app.modules.estoque.MaterialResponse;
import com.nexo.app.modules.obras.application.dto.AlterarItemOrcamentoObraRequest;
import com.nexo.app.modules.obras.application.dto.GerarOrcamentoObraRequest;
import com.nexo.app.modules.obras.application.dto.ItemOrcamentoObraRequest;
import com.nexo.app.modules.obras.application.dto.OrcamentoObraResponse;
import com.nexo.app.modules.obras.application.mappers.ImportacaoObraMapper;
import com.nexo.app.modules.obras.domain.ItemOrcamentoObra;
import com.nexo.app.modules.obras.domain.ItemPlanejado;
import com.nexo.app.modules.obras.domain.KitAplicado;
import com.nexo.app.modules.obras.domain.Medicao;
import com.nexo.app.modules.obras.domain.MedicaoItem;
import com.nexo.app.modules.obras.domain.Obra;
import com.nexo.app.modules.obras.domain.OperacaoItemKit;
import com.nexo.app.modules.obras.domain.OrigemOrcamento;
import com.nexo.app.modules.obras.domain.RevisaoOrcamentoObra;
import com.nexo.app.modules.obras.domain.TipoItemKit;
import com.nexo.app.modules.obras.infrastructure.persistence.ApontamentoExecucaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ItemOrcamentoObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.KitAplicadoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.KitConstrutivoRepository;
import com.nexo.app.modules.obras.domain.ItemKit;
import com.nexo.app.modules.obras.domain.KitConstrutivo;
import com.nexo.app.modules.obras.infrastructure.persistence.MedicaoRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.ObraRepository;
import com.nexo.app.modules.obras.infrastructure.persistence.RevisaoOrcamentoObraRepository;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import com.nexo.app.shared.infrastructure.config.CacheNames;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Orçamento da obra: serviços e materiais com quantidade e valor, em revisões. É a referência com que o planejado, o
 * executado e o medido são comparados na ficha, no planejamento e no relatório de medição. Ultrapassar o orçado só gera
 * aviso: nada é bloqueado. O total do orçamento alimenta os valores previstos da carteira.
 */
@Service
@RequiredArgsConstructor
public class OrcamentoObraUseCases {

    private final ObraUseCases obraUseCases;
    private final ObraRepository obraRepository;
    private final ItemOrcamentoObraRepository itemRepository;
    private final RevisaoOrcamentoObraRepository revisaoRepository;
    private final KitAplicadoRepository kitRepository;
    private final ApontamentoExecucaoRepository apontamentoRepository;
    private final MedicaoRepository medicaoRepository;
    private final KitConstrutivoUseCases kitUseCases;
    private final KitConstrutivoRepository kitConstrutivoRepository;
    private final ContratoApi contratoApi;
    private final EstoqueApi estoqueApi;
    private final ImportacaoObraMapper mapper;

    @Transactional(readOnly = true)
    public OrcamentoObraResponse buscar(UUID idObra) {
        Obra obra = obraUseCases.buscarEntidade(idObra);
        Optional<RevisaoOrcamentoObra> revisao = revisaoRepository.findFirstByIdObraAndAtivoTrueOrderByNumeroDesc(idObra);
        ComparativoOrcamento comparativo = new ComparativoOrcamento();
        itemRepository.findByIdObraAndAtivoTrueOrderByCodigoAsc(idObra).forEach(comparativo::orcar);
        compararComAObra(obra, comparativo);
        List<OrcamentoObraResponse.Item> itens = comparativo.itens();
        return new OrcamentoObraResponse(obra.getId(), revisao.isPresent(), revisao.map(mapper::toRevisao).orElse(null),
                ComparativoOrcamento.totais(itens), ComparativoOrcamento.contagens(itens), itens);
    }

    @Transactional(readOnly = true)
    public List<OrcamentoObraResponse.Revisao> listarRevisoes(UUID idObra) {
        obraUseCases.buscarEntidade(idObra);
        return revisaoRepository.findByIdObraAndAtivoTrueOrderByNumeroDesc(idObra).stream().map(mapper::toRevisao).toList();
    }

    /** Lança um item na revisão atual (sem orçamento, abre a revisão 1). */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.OBRAS, allEntries = true)
    public OrcamentoObraResponse adicionarItem(UUID idObra, ItemOrcamentoObraRequest request) {
        Obra obra = obraUseCases.buscarEntidade(idObra);
        ItemOrcamentoObra.Dados dados = request.tipo() == TipoItemKit.MATERIAL
                ? dadosDoMaterial(request)
                : dadosDoServico(obra, request);
        RevisaoOrcamentoObra revisao = revisaoRepository.findFirstByIdObraAndAtivoTrueOrderByNumeroDesc(idObra)
                .orElseGet(() -> revisaoRepository.save(new RevisaoOrcamentoObra(idObra, 1, OrigemOrcamento.MANUAL, null, null)));
        List<ItemOrcamentoObra> atuais = itemRepository.findByIdObraAndAtivoTrueOrderByCodigoAsc(idObra);
        String chave = ItemOrcamentoObra.chave(dados.tipo(), dados.codigo(), operacao(dados.operacao()));
        if (atuais.stream().anyMatch(i -> i.chave().equals(chave))) {
            throw new InvarianteVioladaException("O item " + dados.codigo() + " já está no orçamento com essa operação. Altere a quantidade dele.");
        }
        atuais.add(itemRepository.save(new ItemOrcamentoObra(idObra, revisao.getId(), null, dados)));
        totalizar(obra, revisao, atuais);
        return buscar(idObra);
    }

    @Transactional
    @CacheEvict(cacheNames = CacheNames.OBRAS, allEntries = true)
    public OrcamentoObraResponse alterarItem(UUID idObra, UUID idItem, AlterarItemOrcamentoObraRequest request) {
        Obra obra = obraUseCases.buscarEntidade(idObra);
        ItemOrcamentoObra item = buscarItem(idObra, idItem);
        BigDecimal valorUnitario = request.valorUnitario() != null ? request.valorUnitario() : item.getValorUnitario();
        // Valor total só fica fixo quando não há unitário para recalcular.
        BigDecimal valorTotal = valorUnitario == null ? item.getValorTotal() : null;
        OperacaoItemKit operacao = request.operacao() != null ? request.operacao() : item.getOperacao();
        List<ItemOrcamentoObra> atuais = itemRepository.findByIdObraAndAtivoTrueOrderByCodigoAsc(idObra);
        String chave = ItemOrcamentoObra.chave(item.getTipo(), item.getCodigo(), operacao);
        if (atuais.stream().anyMatch(i -> !i.getId().equals(idItem) && i.chave().equals(chave))) {
            throw new InvarianteVioladaException("O item " + item.getCodigo() + " já está no orçamento com essa operação.");
        }
        item.alterar(operacao, request.quantidade(), valorUnitario, valorTotal);
        itemRepository.save(item);
        totalizar(obra, revisaoAtual(idObra), atuais);
        return buscar(idObra);
    }

    @Transactional
    @CacheEvict(cacheNames = CacheNames.OBRAS, allEntries = true)
    public OrcamentoObraResponse removerItem(UUID idObra, UUID idItem) {
        Obra obra = obraUseCases.buscarEntidade(idObra);
        ItemOrcamentoObra item = buscarItem(idObra, idItem);
        item.desativar();
        itemRepository.save(item);
        totalizar(obra, revisaoAtual(idObra), itemRepository.findByIdObraAndAtivoTrueOrderByCodigoAsc(idObra));
        return buscar(idObra);
    }

    /**
     * Nova revisão com o que o planejamento dos pontos prevê: serviços com o valor vigente do contrato, materiais com o
     * preço orçado no kit (sem preço, só a quantidade).
     */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.OBRAS, allEntries = true)
    public OrcamentoObraResponse gerarDoPlanejamento(UUID idObra, GerarOrcamentoObraRequest request) {
        Obra obra = obraUseCases.buscarEntidade(idObra);
        LocalDate hoje = LocalDate.now();
        Map<UUID, Map<UUID, BigDecimal>> valores = new HashMap<>();
        Map<String, ItemOrcamentoObra.Dados> porChave = new LinkedHashMap<>();
        List<KitAplicado> aplicados = kitRepository.listarComItens(idObra);
        Map<String, BigDecimal> precos = precosDosMateriais(aplicados);
        for (KitAplicado kit : aplicados) {
            Map<UUID, BigDecimal> doContrato = kit.getIdContrato() == null ? Map.of()
                    : valores.computeIfAbsent(kit.getIdContrato(), id -> kitUseCases.valoresVigentes(id, hoje));
            for (ItemPlanejado item : kit.getItensAtivos()) {
                BigDecimal unitario = item.getTipo() == TipoItemKit.SERVICO ? doContrato.get(item.getIdAcao())
                        : precos.get(chavePreco(kit.getIdKit(), item.getIdMaterial(), item.getOperacao()));
                if (item.getTipo() == TipoItemKit.SERVICO && unitario == null) {
                    unitario = BigDecimal.ZERO;
                }
                BigDecimal unit = unitario;
                porChave.merge(ItemOrcamentoObra.chave(item.getTipo(), item.getCodigo(), item.getOperacao()),
                        new ItemOrcamentoObra.Dados(item.getTipo(), item.getOperacao(), item.getCodigo(), item.getDescricao(),
                                item.getUnidade(), item.getQuantidadePrevista(), unit, null, item.getIdAcao(), item.getIdMaterial()),
                        (a, b) -> new ItemOrcamentoObra.Dados(a.tipo(), a.operacao(), a.codigo(), a.descricao(), a.unidade(),
                                a.quantidade().add(b.quantidade()), a.valorUnitario(), null, a.idAcao(), a.idMaterial()));
            }
        }
        if (porChave.isEmpty()) {
            throw new InvarianteVioladaException("O planejamento desta obra ainda não tem kits. Aplique os kits nos pontos antes de gerar o orçamento.");
        }
        String observacao = request != null && request.observacao() != null && !request.observacao().isBlank()
                ? request.observacao() : "Gerado do planejamento dos pontos";
        substituir(obra, OrigemOrcamento.PLANEJAMENTO, null, observacao, new ArrayList<>(porChave.values()));
        return buscar(idObra);
    }

    /**
     * Grava uma revisão nova com os itens informados; a revisão anterior e seus itens ficam no histórico. Usado pela
     * importação, pela geração a partir do planejamento e pela planilha do relatório de medição.
     */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.OBRAS, allEntries = true)
    public RevisaoOrcamentoObra substituir(Obra obra, OrigemOrcamento origem, UUID idImportacao, String observacao,
                                           List<ItemOrcamentoObra.Dados> itens) {
        if (itens.isEmpty()) {
            throw new InvarianteVioladaException("O orçamento precisa de ao menos um item.");
        }
        int numero = revisaoRepository.findFirstByIdObraAndAtivoTrueOrderByNumeroDesc(obra.getId())
                .map(r -> r.getNumero() + 1).orElse(1);
        List<ItemOrcamentoObra> anteriores = itemRepository.findByIdObraAndAtivoTrueOrderByCodigoAsc(obra.getId());
        anteriores.forEach(ItemOrcamentoObra::desativar);
        itemRepository.saveAll(anteriores);
        RevisaoOrcamentoObra revisao = revisaoRepository.save(new RevisaoOrcamentoObra(obra.getId(), numero, origem, observacao, idImportacao));
        List<ItemOrcamentoObra> novos = itens.stream()
                .map(d -> new ItemOrcamentoObra(obra.getId(), revisao.getId(), idImportacao, d)).toList();
        itemRepository.saveAll(novos);
        totalizar(obra, revisao, novos);
        return revisao;
    }

    /** Planejado (kits dos pontos), executado (apontamentos) e medido (medições não estornadas) da obra. */
    void compararComAObra(Obra obra, ComparativoOrcamento comparativo) {
        LocalDate hoje = LocalDate.now();
        Map<UUID, Map<UUID, BigDecimal>> valores = new HashMap<>();
        Map<UUID, ApontamentoExecucaoRepository.ExecucaoDoItem> execucao = apontamentoRepository.somarPorItemDaObra(obra.getId()).stream()
                .collect(Collectors.toMap(ApontamentoExecucaoRepository.ExecucaoDoItem::idItem, Function.identity()));
        List<KitAplicado> aplicados = kitRepository.listarComItens(obra.getId());
        Map<String, BigDecimal> precos = precosDosMateriais(aplicados);
        for (KitAplicado kit : aplicados) {
            Map<UUID, BigDecimal> doContrato = kit.getIdContrato() == null ? Map.of()
                    : valores.computeIfAbsent(kit.getIdContrato(), id -> kitUseCases.valoresVigentes(id, hoje));
            for (ItemPlanejado item : kit.getItensAtivos()) {
                BigDecimal unitario = item.getTipo() == TipoItemKit.SERVICO ? doContrato.get(item.getIdAcao())
                        : precos.get(chavePreco(kit.getIdKit(), item.getIdMaterial(), item.getOperacao()));
                comparativo.planejar(item.getTipo(), item.getCodigo(), item.getOperacao(), item.getDescricao(), item.getUnidade(),
                        item.getIdAcao(), item.getIdMaterial(), item.getQuantidadePrevista(),
                        unitario != null ? unitario.multiply(item.getQuantidadePrevista()) : null);
                ApontamentoExecucaoRepository.ExecucaoDoItem executado = execucao.get(item.getId());
                if (executado != null) {
                    comparativo.executar(item.getTipo(), item.getCodigo(), item.getOperacao(), executado.quantidade(),
                            item.getTipo() == TipoItemKit.SERVICO ? executado.valor() : null);
                }
            }
        }
        for (Medicao medicao : medicaoRepository.listarDaObraComItens(obra.getId())) {
            if (medicao.estornada()) {
                continue;
            }
            for (MedicaoItem item : medicao.getItens()) {
                TipoItemKit tipo = item.getItemPlanejado() != null ? item.getItemPlanejado().getTipo() : TipoItemKit.SERVICO;
                comparativo.medir(tipo, item.getCodigo(), item.getOperacao(), item.getDescricao(), item.getUnidade(),
                        item.getQuantidade(), item.getValorTotal());
            }
        }
    }

    /** Preço atual dos materiais nos kits aplicados, por kit, material e operação. */
    private Map<String, BigDecimal> precosDosMateriais(List<KitAplicado> aplicados) {
        List<UUID> ids = aplicados.stream().map(KitAplicado::getIdKit).filter(java.util.Objects::nonNull).distinct().toList();
        Map<String, BigDecimal> precos = new HashMap<>();
        if (ids.isEmpty()) {
            return precos;
        }
        for (KitConstrutivo kit : kitConstrutivoRepository.findAllById(ids)) {
            for (ItemKit item : kit.getItensAtivos()) {
                if (item.getTipo() == TipoItemKit.MATERIAL && item.getValorUnitario() != null) {
                    precos.put(chavePreco(kit.getId(), item.getIdMaterial(), item.getOperacao()), item.getValorUnitario());
                }
            }
        }
        return precos;
    }

    private static String chavePreco(UUID idKit, UUID idMaterial, OperacaoItemKit operacao) {
        return idKit + "|" + idMaterial + "|" + operacao;
    }

    private ItemOrcamentoObra.Dados dadosDoServico(Obra obra, ItemOrcamentoObraRequest request) {
        AcaoResponse acao = contratoApi.buscarAcaoPorIdResponse(request.idReferencia())
                .filter(AcaoResponse::ativo)
                .orElseThrow(() -> new InvarianteVioladaException("O serviço escolhido não existe ou está inativo no contrato."));
        BigDecimal unitario = request.valorUnitario();
        if (unitario == null && obra.getIdContrato() != null) {
            unitario = kitUseCases.valoresVigentes(obra.getIdContrato(), LocalDate.now()).get(acao.id());
        }
        if (unitario == null) {
            throw new InvarianteVioladaException("Informe o valor unitário: a obra não tem contrato com valor para o serviço " + acao.codigo() + ".");
        }
        return new ItemOrcamentoObra.Dados(TipoItemKit.SERVICO, operacao(request.operacao()), acao.codigo(), acao.nome(), null,
                request.quantidade(), unitario, null, acao.id(), null);
    }

    private ItemOrcamentoObra.Dados dadosDoMaterial(ItemOrcamentoObraRequest request) {
        MaterialResponse material = estoqueApi.buscarMaterialPorIdResponse(request.idReferencia())
                .filter(MaterialResponse::ativo)
                .orElseThrow(() -> new InvarianteVioladaException("O material escolhido não existe ou está inativo no catálogo."));
        return new ItemOrcamentoObra.Dados(TipoItemKit.MATERIAL, operacao(request.operacao()), material.codigo(), material.descricao(),
                material.unidadeMedida(), request.quantidade(), request.valorUnitario(), null, null, material.id());
    }

    private void totalizar(Obra obra, RevisaoOrcamentoObra revisao, List<ItemOrcamentoObra> itens) {
        revisao.totalizar(itens);
        revisaoRepository.save(revisao);
        obra.informarValoresDoOrcamento(revisao.getValorServicos(), revisao.getValorMateriais());
        obraRepository.save(obra);
    }

    private ItemOrcamentoObra buscarItem(UUID idObra, UUID idItem) {
        return itemRepository.findByIdAndIdObraAndAtivoTrue(idItem, idObra)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Item do orçamento não encontrado nesta obra."));
    }

    private RevisaoOrcamentoObra revisaoAtual(UUID idObra) {
        return revisaoRepository.findFirstByIdObraAndAtivoTrueOrderByNumeroDesc(idObra)
                .orElseThrow(() -> new RecursoNaoEncontradoException("A obra não tem orçamento."));
    }

    private static OperacaoItemKit operacao(OperacaoItemKit operacao) {
        return operacao != null ? operacao : OperacaoItemKit.INSTALAR;
    }
}
