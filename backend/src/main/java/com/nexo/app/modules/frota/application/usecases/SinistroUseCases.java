package com.nexo.app.modules.frota.application.usecases;

import com.nexo.app.modules.financeiro.FinanceiroApi;
import com.nexo.app.modules.frota.FrotaCondutorApi;
import com.nexo.app.modules.frota.application.dto.AbrirOrdemServicoRequest;
import com.nexo.app.modules.frota.application.dto.AbrirReparoSinistroRequest;
import com.nexo.app.modules.frota.application.dto.AcionarSeguradoraRequest;
import com.nexo.app.modules.frota.application.dto.ApoliceResponse;
import com.nexo.app.modules.frota.application.dto.ArquivoAnexoDespesa;
import com.nexo.app.modules.frota.application.dto.OrdemServicoDetalheResponse;
import com.nexo.app.modules.frota.application.dto.ResumoSinistrosResponse;
import com.nexo.app.modules.frota.application.dto.SinistroFilter;
import com.nexo.app.modules.frota.application.dto.SinistroRequest;
import com.nexo.app.modules.frota.application.dto.SinistroResponse;
import com.nexo.app.modules.frota.domain.AnexoSinistro;
import com.nexo.app.modules.frota.domain.Apolice;
import com.nexo.app.modules.frota.domain.OrdemServico;
import com.nexo.app.modules.frota.domain.OrigemOrdemServico;
import com.nexo.app.modules.frota.domain.Sinistro;
import com.nexo.app.modules.frota.domain.SituacaoSinistro;
import com.nexo.app.modules.frota.infrastructure.persistence.AnexoSinistroRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.ApoliceRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.FichaVeiculoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.OrdemServicoRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SinistroRepository;
import com.nexo.app.modules.frota.infrastructure.persistence.SinistroSpecification;
import com.nexo.app.shared.application.dto.PageResponse;
import com.nexo.app.shared.domain.events.FrotaSinistroRegistradoEvent;
import com.nexo.app.shared.domain.exception.InvarianteVioladaException;
import com.nexo.app.shared.domain.exception.RecursoNaoEncontradoException;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Sinistros: registro com o condutor do momento, correção, seguradora acionada, OS de reparo
 * (origem {@code SINISTRO}), finalização, cancelamento, anexos e os totais por tipo, base e condutor.
 */
@Service
@RequiredArgsConstructor
public class SinistroUseCases {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter DATA_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private final SinistroRepository repository;
    private final AnexoSinistroRepository anexos;
    private final ApoliceRepository apolices;
    private final FichaVeiculoRepository fichas;
    private final OrdemServicoRepository ordens;
    private final OrdemServicoUseCases ordensServico;
    private final AnexosFrota arquivos;
    private final ReferenciasFrota referencias;
    private final FrotaCondutorApi condutores;
    private final FinanceiroApi financeiro;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public PageResponse<SinistroResponse> listar(SinistroFilter filtro, Pageable pageable) {
        Page<Sinistro> pagina = repository.findAll(especificacao(filtro), pageable);
        return PageResponse.fromPage(new PageImpl<>(montar(pagina.getContent()), pageable, pagina.getTotalElements()));
    }

    /** Totais do recorte por tipo, base e condutor (cabeçalho da lista e aba Sinistros da ficha). */
    @Transactional(readOnly = true)
    public ResumoSinistrosResponse resumo(SinistroFilter filtro) {
        List<Sinistro> todos = repository.findAll(especificacao(filtro));
        var bases = referencias.nomesBases(todos.stream().map(Sinistro::getIdBaseOperacional).filter(Objects::nonNull).distinct().toList());
        var pessoas = referencias.nomesColaboradores(todos.stream().map(Sinistro::getIdCondutor).filter(Objects::nonNull).distinct().toList());
        var porTipo = contar(todos, s -> s.getTipo().name(), s -> s.getTipo().getRotulo());
        var porBase = contar(todos, s -> s.getIdBaseOperacional() == null ? "" : s.getIdBaseOperacional().toString(),
                s -> s.getIdBaseOperacional() == null ? "Sem base" : bases.getOrDefault(s.getIdBaseOperacional(), "Base"));
        var porCondutor = contar(todos, s -> s.getIdCondutor() == null ? "" : s.getIdCondutor().toString(),
                s -> s.getIdCondutor() == null ? "Não identificado" : pessoas.getOrDefault(s.getIdCondutor(), "Condutor"));
        long emAndamento = todos.stream().filter(s -> !s.getSituacao().isEncerrada()).count();
        long comCulpa = todos.stream().filter(s -> Boolean.TRUE.equals(s.getCulpaCondutor())).count();
        BigDecimal franquias = todos.stream().map(Sinistro::getFranquiaPaga).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new ResumoSinistrosResponse(todos.size(), emAndamento, comCulpa, franquias, porTipo, porBase, porCondutor);
    }

    @Transactional(readOnly = true)
    public SinistroResponse buscarPorId(UUID id) {
        return montar(List.of(buscarEntidade(id))).get(0);
    }

    @Transactional
    public SinistroResponse registrar(SinistroRequest request) {
        var ficha = fichas.findByIdVeiculo(request.idVeiculo())
                .orElseThrow(() -> new InvarianteVioladaException("Veículo não encontrado na frota."));
        var sinistro = repository.saveAndFlush(Sinistro.registrar(ficha, dados(request), OffsetDateTime.now()));
        var resposta = montar(List.of(sinistro)).get(0);
        eventPublisher.publishEvent(new FrotaSinistroRegistradoEvent(sinistro.getId(), sinistro.getNumero(),
                sinistro.getTipo().getRotulo(), sinistro.getTipo().name(), sinistro.getPlaca(), resposta.baseOperacional(),
                sinistro.getOcorridoEm().atZoneSameInstant(FUSO).format(DATA_HORA), sinistro.getLocal(),
                resposta.condutor() == null ? "não identificado" : resposta.condutor(), resumo(sinistro.getDescricao()), link(sinistro)));
        return resposta;
    }

    @Transactional
    public SinistroResponse atualizar(UUID id, SinistroRequest request) {
        var sinistro = buscarEntidade(id);
        if (!sinistro.getIdVeiculo().equals(request.idVeiculo())) {
            throw new InvarianteVioladaException("O veículo do sinistro não muda. Cancele e registre de novo se foi lançado no veículo errado.");
        }
        sinistro.atualizar(dados(request), OffsetDateTime.now());
        return montar(List.of(repository.save(sinistro))).get(0);
    }

    /**
     * Abre a OS de reparo do veículo já ligada ao sinistro: origem {@code SINISTRO}, condutor do
     * sinistro e, sem descrição, o relato dele.
     */
    @Transactional
    public SinistroResponse abrirOrdemServico(UUID id, AbrirReparoSinistroRequest request) {
        var sinistro = buscarEntidade(id);
        sinistro.exigirPodeAbrirOrdemServico();
        String descricao = StringUtils.hasText(request.descricao()) ? request.descricao()
                : sinistro.rotulo() + " (" + sinistro.getTipo().getRotulo().toLowerCase() + "): " + sinistro.getDescricao();
        var pedido = new AbrirOrdemServicoRequest(sinistro.getIdVeiculo(), request.tipoManutencao(), OrigemOrdemServico.SINISTRO,
                request.criticidade(), request.motivo(), descricao.length() > 2000 ? descricao.substring(0, 2000) : descricao,
                request.idsItem(), request.idCondutor() != null ? request.idCondutor() : sinistro.getIdCondutor(),
                request.abertaEm(), request.kmAbertura(), request.tipoOficina(), request.idFornecedor(), request.oficinaNome(),
                request.veiculoParado());
        OrdemServicoDetalheResponse os = ordensServico.abrirPeloSinistro(pedido);
        sinistro.vincularOrdemServico(os.ordem().id());
        return montar(List.of(repository.save(sinistro))).get(0);
    }

    @Transactional
    public SinistroResponse acionarSeguradora(UUID id, AcionarSeguradoraRequest request) {
        var sinistro = buscarEntidade(id);
        Apolice apolice = apolices.findById(request.idApolice())
                .filter(Apolice::isAtivo)
                .orElseThrow(() -> new InvarianteVioladaException("Apólice não encontrada."));
        sinistro.acionarSeguradora(apolice, request.numeroSinistroSeguradora(), request.acionadaEm(), OffsetDateTime.now());
        return montar(List.of(repository.save(sinistro))).get(0);
    }

    @Transactional
    public SinistroResponse finalizar(UUID id, BigDecimal franquiaPaga) {
        var sinistro = buscarEntidade(id);
        sinistro.finalizar(franquiaPaga, osAberta(sinistro), OffsetDateTime.now());
        return montar(List.of(repository.save(sinistro))).get(0);
    }

    @Transactional
    public SinistroResponse cancelar(UUID id, String motivo) {
        var sinistro = buscarEntidade(id);
        sinistro.cancelar(motivo, osAberta(sinistro), OffsetDateTime.now());
        return montar(List.of(repository.save(sinistro))).get(0);
    }

    @Transactional
    public SinistroResponse anexar(UUID id, MultipartFile arquivo) {
        var sinistro = buscarEntidade(id);
        if (!sinistro.isAtivo() || sinistro.getSituacao() == SituacaoSinistro.CANCELADO) {
            throw new InvarianteVioladaException("Este sinistro foi cancelado.");
        }
        arquivos.enviar("frota/sinistros/" + id, arquivo,
                a -> anexos.saveAndFlush(new AnexoSinistro(id, a.chave(), a.nome(), a.contentType(), a.tamanho())));
        return montar(List.of(sinistro)).get(0);
    }

    @Transactional(readOnly = true)
    public ArquivoAnexoDespesa baixarAnexo(UUID id, UUID idAnexo) {
        var anexo = anexo(id, idAnexo);
        return new ArquivoAnexoDespesa(anexo.getArquivoNome(), anexo.getArquivoContentType(), anexo.getArquivoTamanhoBytes(),
                arquivos.baixar(anexo.getArquivoChave()));
    }

    /** Exclusão lógica do anexo; o arquivo fica para auditoria. */
    @Transactional
    public SinistroResponse removerAnexo(UUID id, UUID idAnexo) {
        var anexo = anexo(id, idAnexo);
        anexo.desativar();
        anexos.save(anexo);
        return buscarPorId(id);
    }

    Sinistro buscarEntidade(UUID id) {
        return repository.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Sinistro não encontrado."));
    }

    static String link(Sinistro sinistro) {
        return "/frota/sinistros?sinistro=" + sinistro.getId();
    }

    private boolean osAberta(Sinistro sinistro) {
        return sinistro.getIdOrdemServico() != null && ordens.findById(sinistro.getIdOrdemServico())
                .map(os -> os.getSituacao().isAberta()).orElse(false);
    }

    /** Sem condutor informado, quem estava vinculado ao veículo no instante do sinistro. */
    private Sinistro.Dados dados(SinistroRequest r) {
        UUID condutor = r.idCondutor();
        if (condutor != null && !referencias.colaboradorAtivo(condutor)) {
            throw new InvarianteVioladaException("Condutor não encontrado ou desativado.");
        }
        if (condutor == null && r.idVeiculo() != null && r.ocorridoEm() != null) {
            condutor = condutores.condutorEm(r.idVeiculo(), r.ocorridoEm()).orElse(null);
        }
        return new Sinistro.Dados(r.ocorridoEm(), r.local(), r.tipo(), condutor, r.culpaCondutor(), r.descricao(),
                r.terceiros(), r.boletimOcorrencia());
    }

    private List<SinistroResponse> montar(List<Sinistro> sinistros) {
        if (sinistros.isEmpty()) {
            return List.of();
        }
        var veiculos = referencias.veiculos(sinistros.stream().map(Sinistro::getIdVeiculo).distinct().toList());
        var bases = referencias.nomesBases(sinistros.stream().map(Sinistro::getIdBaseOperacional).filter(Objects::nonNull).distinct().toList());
        var pessoas = referencias.nomesColaboradores(sinistros.stream().map(Sinistro::getIdCondutor).filter(Objects::nonNull).distinct().toList());
        Map<UUID, Apolice> porApolice = apolices.findAllById(sinistros.stream().map(Sinistro::getIdApolice).filter(Objects::nonNull)
                .distinct().toList()).stream().collect(Collectors.toMap(Apolice::getId, Function.identity()));
        var idsSeguradora = porApolice.values().stream().map(Apolice::getIdSeguradora).distinct().toList();
        Map<UUID, String> seguradoras = idsSeguradora.isEmpty() ? Map.of() : financeiro.nomesFornecedores(idsSeguradora);
        Map<UUID, OrdemServico> porOs = ordens.findAllById(sinistros.stream().map(Sinistro::getIdOrdemServico).filter(Objects::nonNull)
                .distinct().toList()).stream().collect(Collectors.toMap(OrdemServico::getId, Function.identity()));
        Map<UUID, List<AnexoSinistro>> anexosPorSinistro = anexos.findAllByIdSinistroInAndAtivoTrue(sinistros.stream().map(Sinistro::getId).toList())
                .stream().collect(Collectors.groupingBy(AnexoSinistro::getIdSinistro));
        return sinistros.stream().map(s -> {
            var v = veiculos.get(s.getIdVeiculo());
            var apolice = s.getIdApolice() == null ? null : porApolice.get(s.getIdApolice());
            var seguradora = apolice == null ? null : new SinistroResponse.Seguradora(apolice.getId(), apolice.getNumero(),
                    seguradoras.get(apolice.getIdSeguradora()), apolice.getFranquia(), s.getNumeroSinistroSeguradora(),
                    s.getSeguradoraAcionadaEm());
            var os = s.getIdOrdemServico() == null ? null : porOs.get(s.getIdOrdemServico());
            var reparo = os == null ? null : new SinistroResponse.Reparo(os.getId(), os.getNumero(), os.getSituacao(),
                    os.getSituacao().getRotulo(), os.getSituacao().isAberta(), os.isParadaEmCurso(), os.getFimReal());
            boolean podeFinalizar = s.isAtivo() && !s.getSituacao().isEncerrada() && (os == null || !os.getSituacao().isAberta());
            return new SinistroResponse(s.getId(), s.getNumero(), s.getIdVeiculo(), s.getPlaca(), v == null ? null : v.modelo(),
                    s.getIdBaseOperacional(), s.getIdBaseOperacional() == null ? null : bases.get(s.getIdBaseOperacional()),
                    s.getOcorridoEm(), s.getLocal(), s.getTipo(), s.getTipo().getRotulo(),
                    s.getIdCondutor(), s.getIdCondutor() == null ? null : pessoas.get(s.getIdCondutor()), s.getCulpaCondutor(),
                    s.getDescricao(), s.getTerceiros(), s.getBoletimOcorrencia(), seguradora, s.getFranquiaPaga(), reparo,
                    s.getSituacao(), s.getSituacao().getRotulo(), podeFinalizar, s.getFinalizadoEm(), s.getCanceladoEm(),
                    s.getMotivoCancelamento(),
                    anexosPorSinistro.getOrDefault(s.getId(), List.of()).stream()
                            .sorted(Comparator.comparing(AnexoSinistro::getDataCriacao))
                            .map(a -> new ApoliceResponse.Anexo(a.getId(), a.getArquivoNome(), a.getArquivoContentType(),
                                    a.getArquivoTamanhoBytes(), a.getDataCriacao())).toList(),
                    s.getDataCriacao(), s.getUsuarioCriacao());
        }).toList();
    }

    private Specification<Sinistro> especificacao(SinistroFilter f) {
        SinistroFilter filtro = f == null ? new SinistroFilter(null, null, null, null, null, null, null, null, null) : f;
        Collection<UUID> idsVeiculo = null;
        if (filtro.idVeiculo() != null) {
            idsVeiculo = List.of(filtro.idVeiculo());
        } else if (StringUtils.hasText(filtro.busca())) {
            idsVeiculo = referencias.idsVeiculosPorTrecho(filtro.busca().trim());
        }
        OffsetDateTime de = filtro.de() == null ? null : filtro.de().atStartOfDay(FUSO).toOffsetDateTime();
        OffsetDateTime ate = filtro.ate() == null ? null : filtro.ate().plusDays(1).atStartOfDay(FUSO).toOffsetDateTime();
        return SinistroSpecification.of(idsVeiculo, filtro.idsBase(), filtro.tipos(), filtro.situacoes(), filtro.idCondutor(),
                filtro.idApolice(), de, ate);
    }

    private AnexoSinistro anexo(UUID id, UUID idAnexo) {
        return anexos.findById(idAnexo).filter(AnexoSinistro::isAtivo).filter(a -> a.getIdSinistro().equals(id))
                .orElseThrow(() -> new RecursoNaoEncontradoException("Anexo não encontrado neste sinistro."));
    }

    private static List<ResumoSinistrosResponse.Linha> contar(List<Sinistro> lista, Function<Sinistro, String> chave,
                                                               Function<Sinistro, String> rotulo) {
        Map<String, List<Sinistro>> grupos = lista.stream().collect(Collectors.groupingBy(chave, LinkedHashMap::new, Collectors.toList()));
        return grupos.entrySet().stream()
                .map(e -> new ResumoSinistrosResponse.Linha(e.getKey(), rotulo.apply(e.getValue().get(0)), e.getValue().size()))
                .sorted(Comparator.comparingLong(ResumoSinistrosResponse.Linha::quantidade).reversed()
                        .thenComparing(ResumoSinistrosResponse.Linha::rotulo))
                .toList();
    }

    private static String resumo(String texto) {
        return texto.length() > 200 ? texto.substring(0, 199) + "…" : texto;
    }
}
