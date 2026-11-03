package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.AjusteEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.AlmoxarifadoFrotaRequest;
import com.nexo.app.modules.frota.application.dto.AlmoxarifadoFrotaResponse;
import com.nexo.app.modules.frota.application.dto.EntradaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.MovimentoEstoqueFrotaFilter;
import com.nexo.app.modules.frota.application.dto.MovimentoEstoqueFrotaResponse;
import com.nexo.app.modules.frota.application.dto.ParametrosPecaFrotaRequest;
import com.nexo.app.modules.frota.application.dto.PecaFrotaRequest;
import com.nexo.app.modules.frota.application.dto.SaidaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.application.dto.TransferenciaEstoqueFrotaRequest;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.infrastructure.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Estoque da oficina da frota: a frota orquestra e o módulo de estoque executa
 * ({@link EstoqueFrotaApi}). Aqui entram as permissões da frota, o veículo e os nomes para a tela.
 */
@Service
@RequiredArgsConstructor
public class EstoqueOficinaFrotaUseCases {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private final EstoqueFrotaApi estoque;
    private final ReferenciasFrota referencias;
    private final FinanceiroApi financeiro;
    private final FichaVeiculoRepository fichas;
    private final OrdemServicoRepository ordens;

    // ── Almoxarifados ────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<AlmoxarifadoFrotaResponse> almoxarifados() {
        var lista = estoque.almoxarifados();
        var bases = referencias.nomesBases(lista.stream().map(EstoqueFrotaApi.Almoxarifado::idBaseOperacional).filter(Objects::nonNull).toList());
        return lista.stream().map(a -> new AlmoxarifadoFrotaResponse(a.id(), a.nome(), a.idBaseOperacional(),
                a.idBaseOperacional() == null ? null : bases.get(a.idBaseOperacional()), a.ativo())).toList();
    }

    @Transactional
    public AlmoxarifadoFrotaResponse criarAlmoxarifado(AlmoxarifadoFrotaRequest request) {
        exigirBase(request.idBaseOperacional());
        return resposta(estoque.criarAlmoxarifado(request.nome(), request.idBaseOperacional()));
    }

    @Transactional
    public AlmoxarifadoFrotaResponse atualizarAlmoxarifado(UUID id, AlmoxarifadoFrotaRequest request) {
        exigirBase(request.idBaseOperacional());
        return resposta(estoque.atualizarAlmoxarifado(id, request.nome(), request.idBaseOperacional()));
    }

    @Transactional
    public void desativarAlmoxarifado(UUID id) {
        estoque.desativarAlmoxarifado(id);
    }

    // ── Catálogo ─────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<EstoqueFrotaApi.Peca> pecas(String busca, String grupo, Boolean ativo, Pageable pageable) {
        return estoque.pecas(busca, grupo, ativo == null ? Boolean.TRUE : ativo, pageable);
    }

    @Transactional
    public EstoqueFrotaApi.Peca criarPeca(PecaFrotaRequest request) {
        return estoque.criarPeca(dados(request));
    }

    @Transactional
    public EstoqueFrotaApi.Peca atualizarPeca(UUID id, PecaFrotaRequest request) {
        return estoque.atualizarPeca(id, dados(request));
    }

    @Transactional
    public void desativarPeca(UUID id) {
        estoque.desativarPeca(id);
    }

    @Transactional(readOnly = true)
    public List<String> grupos() {
        return estoque.grupos();
    }

    // ── Saldos ───────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<EstoqueFrotaApi.SaldoPeca> saldos(UUID idEstoque) {
        return estoque.saldos(idEstoque);
    }

    @Transactional
    public EstoqueFrotaApi.SaldoPeca definirParametros(UUID idEstoque, UUID idMaterial, ParametrosPecaFrotaRequest request) {
        return estoque.definirParametros(idEstoque, idMaterial, request.estoqueMinimo(), request.localizacao());
    }

    /** Totais do almoxarifado (ou de todos) e o que entrou e saiu nos últimos 30 dias. */
    @Transactional(readOnly = true)
    public EstoqueFrotaApi.Resumo resumo(UUID idEstoque) {
        return estoque.resumo(idEstoque, OffsetDateTime.now().minusDays(30));
    }

    // ── Movimentações ────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<MovimentoEstoqueFrotaResponse> movimentos(MovimentoEstoqueFrotaFilter f, Pageable pageable) {
        var filtro = new EstoqueFrotaApi.FiltroMovimentos(f.idEstoque(), f.idMaterial(), f.idVeiculo(), f.idReferencia(), f.tipos(),
                f.busca(), inicio(f.de()), f.ate() == null ? null : inicio(f.ate().plusDays(1)));
        var pagina = estoque.movimentos(filtro, pageable);
        var conteudo = montar(pagina.getContent());
        return new PageResponse<>(conteudo, pagina.getPage());
    }

    @Transactional
    public List<MovimentoEstoqueFrotaResponse> entrada(EntradaEstoqueFrotaRequest r) {
        if (r.idFornecedor() != null && !financeiro.nomesFornecedores(List.of(r.idFornecedor())).containsKey(r.idFornecedor())) {
            throw new InvarianteVioladaException("Fornecedor não encontrado no financeiro.");
        }
        if (r.dataHora() != null && r.dataHora().isAfter(OffsetDateTime.now().plusMinutes(10))) {
            throw new InvarianteVioladaException("A data da entrada não pode ser no futuro.");
        }
        var itens = r.itens().stream().map(i -> new EstoqueFrotaApi.ItemEntrada(i.idMaterial(), i.quantidade(), i.valorUnitario())).toList();
        var contexto = new EstoqueFrotaApi.Contexto(r.motivo(), r.documento(), r.observacao(), null, r.idFornecedor(), null);
        UUID lote = estoque.entrada(r.idEstoque(), itens, contexto, SecurityUtils.getUsuarioLogadoId(),
                r.dataHora() == null ? OffsetDateTime.now() : r.dataHora());
        return montar(estoque.movimentosDaReferencia(lote));
    }

    @Transactional
    public List<MovimentoEstoqueFrotaResponse> saida(SaidaEstoqueFrotaRequest r) {
        if (r.motivo() == EstoqueFrotaApi.Motivo.ORDEM_SERVICO) {
            throw new InvarianteVioladaException("A saída para OS é lançada na própria OS, nas peças.");
        }
        if (r.idVeiculo() != null && fichas.findByIdVeiculo(r.idVeiculo()).isEmpty()) {
            throw new InvarianteVioladaException("Veículo não encontrado na frota.");
        }
        var itens = r.itens().stream().map(i -> new EstoqueFrotaApi.ItemSaida(i.idMaterial(), i.quantidade())).toList();
        var contexto = new EstoqueFrotaApi.Contexto(r.motivo(), null, r.observacao(), r.idVeiculo(), null, null);
        return montar(estoque.saida(r.idEstoque(), itens, contexto, SecurityUtils.getUsuarioLogadoId(), OffsetDateTime.now()));
    }

    @Transactional
    public List<MovimentoEstoqueFrotaResponse> transferencia(TransferenciaEstoqueFrotaRequest r) {
        var itens = r.itens().stream().map(i -> new EstoqueFrotaApi.ItemSaida(i.idMaterial(), i.quantidade())).toList();
        UUID lote = estoque.transferencia(r.idOrigem(), r.idDestino(), itens, r.observacao(), SecurityUtils.getUsuarioLogadoId(),
                OffsetDateTime.now());
        return montar(estoque.movimentosDaReferencia(lote));
    }

    /** Nulo quando o contado é igual ao saldo (nada a ajustar). */
    @Transactional
    public MovimentoEstoqueFrotaResponse ajuste(AjusteEstoqueFrotaRequest r) {
        var mov = estoque.ajuste(r.idEstoque(), r.idMaterial(), r.quantidadeContada(), r.observacao(), SecurityUtils.getUsuarioLogadoId(),
                OffsetDateTime.now());
        return mov == null ? null : montar(List.of(mov)).get(0);
    }

    // ── Apoio ────────────────────────────────────────────────────────────────────────

    private List<MovimentoEstoqueFrotaResponse> montar(List<EstoqueFrotaApi.Movimento> lista) {
        var placas = fichas.findAllByIdVeiculoIn(ids(lista, EstoqueFrotaApi.Movimento::idVeiculo)).stream()
                .collect(Collectors.toMap(f -> f.getIdVeiculo(), f -> f.getPlaca(), (a, b) -> a));
        var fornecedores = financeiro.nomesFornecedores(ids(lista, EstoqueFrotaApi.Movimento::idFornecedor));
        var usuarios = referencias.nomesPessoas(ids(lista, EstoqueFrotaApi.Movimento::idUsuario));
        Map<UUID, OrdemServico> os = ordens.findAllById(ids(lista.stream()
                        .filter(m -> m.motivo() == EstoqueFrotaApi.Motivo.ORDEM_SERVICO || m.motivo() == EstoqueFrotaApi.Motivo.ESTORNO).toList(),
                EstoqueFrotaApi.Movimento::idReferencia)).stream().collect(Collectors.toMap(OrdemServico::getId, Function.identity()));
        return lista.stream().map(m -> {
            var ordem = m.idReferencia() == null ? null : os.get(m.idReferencia());
            return new MovimentoEstoqueFrotaResponse(m.id(), m.dataHora(), m.tipo(), m.motivo(),
                    m.motivo() == null ? null : m.motivo().getRotulo(), m.idEstoqueOrigem(), m.estoqueOrigem(), m.idEstoqueDestino(),
                    m.estoqueDestino(), m.idMaterial(), m.codigo(), m.descricao(), m.unidade(), m.quantidade(), m.valorUnitario(),
                    m.valorTotal(), m.documento(), m.observacao(), m.idVeiculo(), m.idVeiculo() == null ? null : placas.get(m.idVeiculo()),
                    m.idFornecedor(), m.idFornecedor() == null ? null : fornecedores.get(m.idFornecedor()),
                    ordem == null ? null : ordem.getId(), ordem == null ? null : ordem.getNumero(),
                    m.idUsuario() == null ? null : usuarios.get(m.idUsuario()), m.estornado());
        }).toList();
    }

    private static List<UUID> ids(Collection<EstoqueFrotaApi.Movimento> lista, Function<EstoqueFrotaApi.Movimento, UUID> campo) {
        return lista.stream().map(campo).filter(Objects::nonNull).distinct().toList();
    }

    private AlmoxarifadoFrotaResponse resposta(EstoqueFrotaApi.Almoxarifado a) {
        String base = a.idBaseOperacional() == null ? null : referencias.nomesBases(List.of(a.idBaseOperacional())).get(a.idBaseOperacional());
        return new AlmoxarifadoFrotaResponse(a.id(), a.nome(), a.idBaseOperacional(), base, a.ativo());
    }

    private void exigirBase(UUID idBase) {
        if (idBase != null && !referencias.baseExiste(idBase)) {
            throw new InvarianteVioladaException("Base operacional não encontrada.");
        }
    }

    private static EstoqueFrotaApi.DadosPeca dados(PecaFrotaRequest r) {
        return new EstoqueFrotaApi.DadosPeca(r.codigo(), r.descricao(), r.unidade(), r.grupo());
    }

    private static OffsetDateTime inicio(LocalDate dia) {
        return dia == null ? null : dia.atStartOfDay(FUSO).toOffsetDateTime();
    }
}
