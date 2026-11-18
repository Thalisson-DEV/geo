package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.financeiro.ResumoSolicitacaoFinanceira;
import com.nexo.app.modules.frota.FrotaOdometroApi;
import com.nexo.app.modules.frota.application.dto.HistoricoOrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.ItemOrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.OrcamentoOrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.OrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.PecaOrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.PreventivaOrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.ServicoOrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.TotaisOrdemServicoResponse;
import com.nexo.app.modules.frota.application.dto.RepeticaoManutencaoResponse;
import com.nexo.app.modules.frota.domain.EventoOrdemServico;
import com.nexo.app.modules.frota.domain.ItemOrdemServico;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.ServicoOrdemServico;
import com.nexo.app.modules.frota.domain.SituacaoAprovacaoOrcamento;
import com.nexo.app.modules.frota.domain.SituacaoOrdemServico;
import com.nexo.app.modules.frota.domain.SolicitacaoOrdemServico;
import com.nexo.app.modules.frota.infrastructure.persistence.EventoOrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.RealizacaoPreventivaRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SinistroRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SolicitacaoOrdemServicoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Monta as respostas da OS resolvendo em lote o que pertence a outros módulos (base,
 * condutor, usuário, fornecedor, situação das solicitações): uma consulta por tipo por
 * página, nunca uma por linha.
 */
@Component
@RequiredArgsConstructor
class MontadorOrdemServico {

    private final ReferenciasFrota referencias;
    private final FinanceiroApi financeiro;
    private final SolicitacaoOrdemServicoRepository solicitacoes;
    private final EventoOrdemServicoRepository historico;
    private final OrdemServicoRepository ordens;
    private final RepeticoesManutencao repeticoes;
    private final FrotaOdometroApi odometro;
    private final ParametrosFrotaUseCases parametros;
    private final RealizacaoPreventivaRepository realizacoesPreventivas;
    private final SinistroRepository sinistros;
    private final EstoqueFrotaApi estoqueFrota;

    List<OrdemServicoResponse> montar(List<OrdemServico> lista) {
        if (lista.isEmpty()) return List.of();
        var idsOs = lista.stream().map(OrdemServico::getId).toList();
        Map<UUID, List<SolicitacaoOrdemServico>> vinculos = solicitacoes.findAllByIdOrdemServicoInAndAtivoTrue(idsOs)
                .stream().collect(Collectors.groupingBy(SolicitacaoOrdemServico::getIdOrdemServico));
        Map<UUID, ResumoSolicitacaoFinanceira> resumos = financeiro.resumosSolicitacoes(vinculos.values().stream()
                .flatMap(List::stream).map(SolicitacaoOrdemServico::getIdSolicitacao).toList());
        Map<UUID, String> bases = referencias.nomesBases(lista.stream().map(OrdemServico::getIdBaseOperacional).toList());
        Map<UUID, String> condutores = referencias.nomesColaboradores(lista.stream().map(OrdemServico::getIdCondutor).toList());
        Map<UUID, String> usuarios = referencias.loginsUsuarios(lista.stream().map(OrdemServico::getIdUsuarioAbertura).toList());
        Map<UUID, String> fornecedores = financeiro.nomesFornecedores(lista.stream().map(OrdemServico::getIdFornecedor).toList());
        OffsetDateTime agora = OffsetDateTime.now();

        return lista.stream().map(os -> {
            var doOs = vinculos.getOrDefault(os.getId(), List.of());
            var status = doOs.stream().map(v -> resumos.get(v.getIdSolicitacao())).filter(Objects::nonNull)
                    .map(ResumoSolicitacaoFinanceira::status).toList();
            return new OrdemServicoResponse(
                    os.getId(),
                    os.getNumero(),
                    os.getIdVeiculo(),
                    os.getPlaca(),
                    os.isVeicular(),
                    os.getDescricaoEquipamento(),
                    os.getIdBaseOperacional(),
                    bases.get(os.getIdBaseOperacional()),
                    os.getTipoManutencao(),
                    os.getOrigem(),
                    os.getCriticidade(),
                    os.getMotivo(),
                    os.getSituacao(),
                    os.getDescricao(),
                    os.getItens().stream().map(i -> i.getItem().getNome()).toList(),
                    os.getIdCondutor(),
                    condutores.get(os.getIdCondutor()),
                    os.getAbertaEm(),
                    usuarios.get(os.getIdUsuarioAbertura()),
                    os.getKmAbertura(),
                    os.getUnidadeMedicao(),
                    os.getTipoOficina(),
                    os.getIdFornecedor(),
                    os.getOficinaNome(),
                    nomeOficina(os, fornecedores),
                    os.getAgendadaPara(),
                    os.getLocalAgendamento(),
                    os.getInicioReal(),
                    os.getPrevisaoTermino(),
                    os.getFimReal(),
                    os.getFinalizadaEm(),
                    os.isBaixaPendente(),
                    os.isAtrasada(agora),
                    os.isVeiculoParado(),
                    os.getParadoDesde(),
                    os.getLiberadoEm(),
                    os.isParadaEmCurso(),
                    os.getDescricaoServico(),
                    os.getItensSubstituidos(),
                    os.getValorTotal(),
                    os.getKmEncerramento(),
                    os.getCausa(),
                    os.getCanceladaEm(),
                    os.getMotivoCancelamento(),
                    SituacaoAprovacaoOrcamento.de(status),
                    doOs.size(),
                    os.getItens().stream().anyMatch(ItemOrdemServico::isRepeticao));
        }).toList();
    }

    OrdemServicoDetalheResponse detalhar(OrdemServico os, List<String> avisos) {
        var ordem = montar(List.of(os)).get(0);
        var vinculos = solicitacoes.findAllByIdOrdemServicoAndAtivoTrueOrderByDataCriacaoAsc(os.getId());
        var resumos = financeiro.resumosSolicitacoes(vinculos.stream().map(SolicitacaoOrdemServico::getIdSolicitacao).toList());
        List<OrcamentoOrdemServicoResponse> orcamentos = vinculos.stream()
                .map(v -> resumos.get(v.getIdSolicitacao()))
                .filter(Objects::nonNull)
                .map(r -> new OrcamentoOrdemServicoResponse(r.id(), r.tipo(), r.numero(), r.status(), r.valor(),
                        r.valorAprovado(), r.fornecedor(), r.descricao(), r.dataSubmissao(), r.dataDecisao(),
                        r.motivoRejeicao()))
                .toList();
        return new OrdemServicoDetalheResponse(ordem, itens(os), orcamentos, historico(os.getId()),
                os.isVeicular() ? odometro.kmAtual(os.getIdVeiculo()).orElse(null) : null,
                avisos == null ? List.of() : avisos,
                servicos(os), pecas(os), totais(os), preventivas(os), sinistro(os),
                os.getSituacao() == SituacaoOrdemServico.CANCELADA ? List.of() : os.pendencias());
    }

    private OrdemServicoDetalheResponse.SinistroDaOrdem sinistro(OrdemServico os) {
        if (os.getOrigem() != OrigemOrdemServico.SINISTRO) {
            return null;
        }
        return sinistros.findByIdOrdemServico(os.getId())
                .map(s -> new OrdemServicoDetalheResponse.SinistroDaOrdem(s.getId(), s.getNumero(), s.getTipo().getRotulo(),
                        s.getSituacao().getRotulo()))
                .orElse(null);
    }

    private List<PreventivaOrdemServicoResponse> preventivas(OrdemServico os) {
        return realizacoesPreventivas.findAllByIdOrdemServicoAndAtivoTrue(os.getId()).stream()
                .map(r -> new PreventivaOrdemServicoResponse(r.getControle().getId(), r.getControle().getPlano().getId(),
                        r.getControle().getPlano().getNome(), r.getRoteiro(), r.getSituacao().getRotulo()))
                .toList();
    }

    /**
     * Itens com a repetição: gravada, para OS concluída; calculada na hora, para OS aberta
     * (referência = agora), para a oficina saber antes de executar.
     */
    private List<ItemOrdemServicoResponse> itens(OrdemServico os) {
        var resultado = new ArrayList<ItemOrdemServicoResponse>();
        Map<UUID, OrdemServico> anteriores = anterioresGravadas(os.getItens());
        int janelaPadrao = parametros.janelaRepeticaoDias();
        for (ItemOrdemServico item : os.getItens()) {
            RepeticaoManutencaoResponse repeticao = null;
            if (item.isRepeticao()) {
                var anterior = anteriores.get(item.getIdOsAnterior());
                repeticao = new RepeticaoManutencaoResponse(item.getIdOsAnterior(), item.getNumeroOsAnterior(),
                        anterior == null ? null : anterior.getFimReal(), item.getDiasDesdeAnterior(),
                        item.getItem().janelaRepeticao(janelaPadrao));
            } else if (os.getSituacao().isAberta() && RepeticoesManutencao.contaRepeticao(os)) {
                repeticao = repeticoes.anterior(os.getIdVeiculo(), item.getItem(), os.getId(), OffsetDateTime.now())
                        .map(MontadorOrdemServico::toResponse).orElse(null);
            }
            var natureza = item.getItem().getNatureza();
            resultado.add(new ItemOrdemServicoResponse(item.getItem().getId(), item.getItem().getNome(),
                    natureza, natureza.getRotulo(), repeticao));
        }
        return resultado;
    }

    private List<ServicoOrdemServicoResponse> servicos(OrdemServico os) {
        Map<UUID, String> mecanicos = referencias.nomesColaboradores(os.getServicos().stream()
                .map(ServicoOrdemServico::getIdMecanico).filter(Objects::nonNull).toList());
        return os.getServicos().stream().map(s -> new ServicoOrdemServicoResponse(
                s.getId(),
                s.getDescricao(),
                s.getItem() == null ? null : s.getItem().getId(),
                s.getItem() == null ? null : s.getItem().getNome(),
                s.getIdMecanico(),
                s.getIdMecanico() != null ? mecanicos.get(s.getIdMecanico()) : s.getMecanicoNome(),
                s.getQuantidade(),
                s.getValorUnitario(),
                s.getSubtotal(),
                s.isSemCusto())).toList();
    }

    private static TotaisOrdemServicoResponse totais(OrdemServico os) {
        var t = os.totais();
        boolean calculado = os.temLancamentos();
        return new TotaisOrdemServicoResponse(t.servicos(), t.pecas(), t.desconto(), t.acrescimo(),
                calculado ? t.total() : os.getValorTotal(), calculado, t.pecasEstoque(),
                calculado ? t.aComprar() : os.getValorTotal());
    }

    private List<PecaOrdemServicoResponse> pecas(OrdemServico os) {
        Map<UUID, String> almoxarifados = os.getPecas().stream().anyMatch(p -> p.getIdEstoque() != null)
                ? estoqueFrota.almoxarifados().stream().collect(Collectors.toMap(EstoqueFrotaApi.Almoxarifado::id, EstoqueFrotaApi.Almoxarifado::nome))
                : Map.of();
        return os.getPecas().stream().map(p -> new PecaOrdemServicoResponse(
                p.getId(),
                p.getDescricao(),
                p.getCodigo(),
                p.getOrigem(),
                p.getOrigem().getRotulo(),
                p.getQuantidade(),
                p.getUnidade(),
                p.getValorUnitario(),
                p.getSubtotal(),
                p.getIdMaterial(),
                p.getIdEstoque(),
                p.getIdEstoque() == null ? null : almoxarifados.get(p.getIdEstoque()),
                p.isBaixadaNoEstoque(),
                p.getIdItemManutencao(),
                p.isSemCusto())).toList();
    }

    static RepeticaoManutencaoResponse toResponse(RepeticoesManutencao.Anterior a) {
        return new RepeticaoManutencaoResponse(a.idOs(), a.numero(), a.fimReal(), a.dias(), a.janelaDias());
    }

    private Map<UUID, OrdemServico> anterioresGravadas(Collection<ItemOrdemServico> itens) {
        var ids = itens.stream().map(ItemOrdemServico::getIdOsAnterior).filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) return Map.of();
        return ordens.findAllById(ids).stream().collect(Collectors.toMap(OrdemServico::getId, Function.identity()));
    }

    private List<HistoricoOrdemServicoResponse> historico(UUID idOs) {
        var eventos = historico.findAllByIdOrdemServicoOrderByOcorridoEmAscDataCriacaoAsc(idOs);
        Map<UUID, String> usuarios = referencias.loginsUsuarios(eventos.stream().map(EventoOrdemServico::getIdUsuario).toList());
        return eventos.stream().map(e -> new HistoricoOrdemServicoResponse(e.getTipo(), e.getTipo().getRotulo(),
                e.getDescricao(), e.getIdUsuario() == null ? "Sistema" : usuarios.get(e.getIdUsuario()),
                e.getOcorridoEm())).toList();
    }

    private static String nomeOficina(OrdemServico os, Map<UUID, String> fornecedores) {
        if (os.getIdFornecedor() != null && fornecedores.containsKey(os.getIdFornecedor())) {
            return fornecedores.get(os.getIdFornecedor());
        }
        if (os.getOficinaNome() != null) return os.getOficinaNome();
        return os.getTipoOficina().getRotulo();
    }
}
