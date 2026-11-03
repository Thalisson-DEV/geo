package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.estoque.EstoqueFrotaApi;
import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.application.dto.DescartePneuRequest;
import com.nexo.app.modules.frota.application.dto.EnvioPneuRequest;
import com.nexo.app.modules.frota.application.dto.EventoPneuFilter;
import com.nexo.app.modules.frota.application.dto.EventoPneuResponse;
import com.nexo.app.modules.frota.application.dto.PneuFilter;
import com.nexo.app.modules.frota.application.dto.PneuRequest;
import com.nexo.app.modules.frota.application.dto.PneuResponse;
import com.nexo.app.modules.frota.application.dto.ResumoPneusResponse;
import com.nexo.app.modules.frota.application.dto.RetornoPneuRequest;
import com.nexo.app.modules.frota.domain.EventoPneu;
import com.nexo.app.modules.frota.domain.Pneu;
import com.nexo.app.modules.frota.domain.SituacaoPneu;
import com.nexo.app.modules.frota.domain.TipoEventoPneu;
import com.nexo.app.modules.frota.infrastructure.persistence.EventoPneuRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PneuRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.PneuSpecification;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.application.dto.Paged;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Pneus: cadastro, consulta com custo por km e alertas, histórico, envio e retorno de reparo e
 * reforma e descarte. A montagem no veículo fica em {@link MovimentacaoPneuUseCases}.
 */
@Service
@RequiredArgsConstructor
public class PneuUseCases {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    private final PneuRepository repository;
    private final EventoPneuRepository eventos;
    private final MontadorPneu montador;
    private final EstoqueFrotaApi estoque;
    private final FinanceiroApi financeiro;

    @Transactional(readOnly = true)
    public PageResponse<PneuResponse> listar(PneuFilter filtro, Pageable pageable) {
        BigDecimal sulcoAte = Boolean.TRUE.equals(filtro.sulcoBaixo()) ? montador.sulcoMinimo() : null;
        Page<Pneu> pagina = repository.findAll(PneuSpecification.pneus(filtro.busca(), filtro.situacoes(), filtro.idVeiculo(),
                filtro.idEstoque(), filtro.marca(), sulcoAte), pageable);
        return new PageResponse<>(montador.montar(pagina.getContent()),
                new Paged(pagina.getSize(), pagina.getNumber(), pagina.getTotalElements(), pagina.getTotalPages()));
    }

    @Transactional(readOnly = true)
    public PneuResponse buscar(UUID id) {
        return montador.montar(buscarEntidade(id));
    }

    @Transactional(readOnly = true)
    public ResumoPneusResponse resumo() {
        var todos = montador.montar(repository.findAll(PneuSpecification.pneus(null, null, null, null, null, null),
                Sort.by("marcaFogo")));
        Map<SituacaoPneu, Long> porSituacao = todos.stream().collect(Collectors.groupingBy(PneuResponse::situacao, Collectors.counting()));
        var ativos = todos.stream().filter(p -> p.situacao() != SituacaoPneu.DESCARTADO).toList();
        long sulcoBaixo = ativos.stream().filter(p -> p.alertas().contains("SULCO_BAIXO")).count();
        long atencao = ativos.stream().filter(p -> p.alertas().contains("SULCO_ATENCAO")).count();
        long atrasado = ativos.stream().filter(p -> p.alertas().contains("SERVICO_ATRASADO")).count();
        BigDecimal custo = todos.stream().map(PneuResponse::custoTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        var comKm = todos.stream().filter(p -> p.custoPorKm() != null).toList();
        BigDecimal porKm = comKm.isEmpty() ? null : comKm.stream().map(PneuResponse::custoPorKm).reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(comKm.size()), 4, RoundingMode.HALF_UP);
        return new ResumoPneusResponse(ativos.size(), porSituacao.getOrDefault(SituacaoPneu.EM_USO, 0L),
                porSituacao.getOrDefault(SituacaoPneu.DISPONIVEL, 0L), porSituacao.getOrDefault(SituacaoPneu.EM_REPARO, 0L),
                porSituacao.getOrDefault(SituacaoPneu.EM_REFORMA, 0L), porSituacao.getOrDefault(SituacaoPneu.DESCARTADO, 0L),
                sulcoBaixo, atencao, atrasado, montador.sulcoMinimo(), custo, porKm);
    }

    @Transactional(readOnly = true)
    public List<String> marcas() {
        return repository.marcas();
    }

    @Transactional
    public PneuResponse cadastrar(PneuRequest r) {
        exigirMarcaFogoLivre(r.marcaFogo(), null);
        exigirFornecedor(r.idFornecedor());
        if (r.idEstoque() != null) {
            estoque.almoxarifado(r.idEstoque());
        }
        var pneu = repository.saveAndFlush(Pneu.cadastrar(dados(r), r.vida() == null ? 0 : r.vida(), r.kmVida() == null ? 0 : r.kmVida(),
                r.sulcoAtualMm(), r.idEstoque()));
        String descricao = "Pneu cadastrado" + (pneu.getVida() > 0 ? " na " + (pneu.getVida() + 1) + "ª vida" : " novo") + ".";
        eventos.save(EventoPneu.de(pneu, TipoEventoPneu.CADASTRO, OffsetDateTime.now(), descricao)
                .comCusto(pneu.getValorCompra(), pneu.getIdFornecedor(), pneu.getNotaFiscal()));
        return montador.montar(pneu);
    }

    @Transactional
    public PneuResponse atualizar(UUID id, PneuRequest r) {
        var pneu = buscarEntidade(id);
        exigirMarcaFogoLivre(r.marcaFogo(), id);
        exigirFornecedor(r.idFornecedor());
        pneu.atualizar(dados(r));
        return montador.montar(repository.save(pneu));
    }

    @Transactional(readOnly = true)
    public List<EventoPneuResponse> historico(UUID id) {
        var pneu = buscarEntidade(id);
        return montador.eventos(eventos.findAllByIdPneuOrderByOcorridoEmDescDataCriacaoDesc(id), Map.of(id, pneu.getMarcaFogo()));
    }

    /** Histórico de todos os pneus (ou de um veículo), mais recentes primeiro. */
    @Transactional(readOnly = true)
    public PageResponse<EventoPneuResponse> eventos(EventoPneuFilter f, Pageable pageable) {
        Page<EventoPneu> pagina = eventos.findAll(PneuSpecification.eventos(f.idPneu(), f.idVeiculo(), f.tipos(), inicio(f.de()),
                f.ate() == null ? null : inicio(f.ate().plusDays(1))), pageable);
        var marcas = repository.findAllById(pagina.getContent().stream().map(EventoPneu::getIdPneu).distinct().toList()).stream()
                .collect(Collectors.toMap(Pneu::getId, Pneu::getMarcaFogo));
        return new PageResponse<>(montador.eventos(pagina.getContent(), marcas),
                new Paged(pagina.getSize(), pagina.getNumber(), pagina.getTotalElements(), pagina.getTotalPages()));
    }

    /** Pneu disponível vai ao reparo ou à reforma (fora da tela de montagem). */
    @Transactional
    public PneuResponse enviar(UUID id, EnvioPneuRequest r) {
        var pneu = buscarEntidade(id);
        exigirFornecedor(r.idFornecedor());
        var agora = OffsetDateTime.now();
        boolean reparo = r.destino() == EnvioPneuRequest.DestinoPneu.REPARO;
        if (reparo) {
            pneu.enviarReparo(r.idFornecedor(), agora);
        } else {
            pneu.enviarReforma(r.idFornecedor(), agora);
        }
        eventos.save(EventoPneu.de(pneu, reparo ? TipoEventoPneu.ENVIO_REPARO : TipoEventoPneu.ENVIO_REFORMA, agora,
                        reparo ? "Enviado para reparo." : "Enviado para reforma.")
                .comCusto(null, r.idFornecedor(), null).noLote(null, r.observacao()));
        return montador.montar(repository.save(pneu));
    }

    /** Volta do reparo ou da reforma (o que estiver em andamento), com o custo do serviço. */
    @Transactional
    public PneuResponse retornar(UUID id, RetornoPneuRequest r) {
        var pneu = buscarEntidade(id);
        estoque.almoxarifado(r.idEstoque());
        UUID fornecedor = r.idFornecedor() != null ? r.idFornecedor() : pneu.getIdFornecedorServico();
        exigirFornecedor(fornecedor);
        var quando = r.ocorridoEm() == null ? OffsetDateTime.now() : r.ocorridoEm();
        if (quando.isAfter(OffsetDateTime.now().plusMinutes(10))) {
            throw new InvarianteVioladaException("A data do retorno não pode ser no futuro.");
        }
        TipoEventoPneu tipo;
        String descricao;
        if (pneu.getSituacao() == SituacaoPneu.EM_REFORMA) {
            pneu.retornarReforma(r.idEstoque(), r.sulcoMm());
            tipo = TipoEventoPneu.RETORNO_REFORMA;
            descricao = "Voltou da reforma: começa a " + (pneu.getVida() + 1) + "ª vida.";
        } else {
            pneu.retornarReparo(r.idEstoque(), r.sulcoMm());
            tipo = TipoEventoPneu.RETORNO_REPARO;
            descricao = "Voltou do reparo.";
        }
        eventos.save(EventoPneu.de(pneu, tipo, quando, descricao).comCusto(r.valor(), fornecedor, r.documento()).noLote(null, r.observacao()));
        return montador.montar(repository.save(pneu));
    }

    /** Descarte de pneu fora do veículo (disponível, no reparo ou na reforma). */
    @Transactional
    public PneuResponse descartar(UUID id, DescartePneuRequest r) {
        var pneu = buscarEntidade(id);
        var agora = OffsetDateTime.now();
        pneu.descartar(r.motivo(), agora);
        eventos.save(EventoPneu.de(pneu, TipoEventoPneu.DESCARTE, agora, "Descartado: " + r.motivo().trim()));
        return montador.montar(repository.save(pneu));
    }

    /** Guarda o pneu disponível em outro almoxarifado. */
    @Transactional
    public PneuResponse transferir(UUID id, UUID idEstoque) {
        var pneu = buscarEntidade(id);
        var destino = estoque.almoxarifado(idEstoque);
        if (Objects.equals(pneu.getIdEstoque(), idEstoque)) {
            return montador.montar(pneu);
        }
        pneu.guardar(idEstoque);
        eventos.save(EventoPneu.de(pneu, TipoEventoPneu.TRANSFERENCIA, OffsetDateTime.now(), "Guardado no " + destino.nome() + "."));
        return montador.montar(repository.save(pneu));
    }

    Pneu buscarEntidade(UUID id) {
        return repository.findById(id).filter(Pneu::isAtivo)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Pneu não encontrado."));
    }

    private void exigirMarcaFogoLivre(String marcaFogo, UUID id) {
        if (marcaFogo != null && repository.existsMarcaFogoEmUso(marcaFogo.trim(), id)) {
            throw new InvarianteVioladaException("Já existe um pneu com a marca de fogo " + marcaFogo.trim().toUpperCase() + ".");
        }
    }

    private void exigirFornecedor(UUID idFornecedor) {
        if (idFornecedor != null && !financeiro.nomesFornecedores(List.of(idFornecedor)).containsKey(idFornecedor)) {
            throw new InvarianteVioladaException("Fornecedor não encontrado no financeiro.");
        }
    }

    private static Pneu.Dados dados(PneuRequest r) {
        return new Pneu.Dados(r.marcaFogo(), r.numeroSerie(), r.marca(), r.modelo(), r.largura(), r.perfil(), r.aro(),
                r.radial() == null || r.radial(), Boolean.TRUE.equals(r.comCamara()), r.indiceCarga(), r.indiceVelocidade(), r.lonas(),
                r.dot(), r.idFornecedor(), r.notaFiscal(), r.dataCompra(), r.valorCompra(), r.sulcoInicialMm(), r.pressaoRecomendadaPsi(),
                r.observacao());
    }

    private static OffsetDateTime inicio(LocalDate dia) {
        return dia == null ? null : dia.atStartOfDay(FUSO).toOffsetDateTime();
    }
}
